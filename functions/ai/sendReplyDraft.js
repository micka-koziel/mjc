/**
 * Cloud Function sendReplyDraft — Envoi ou sauvegarde brouillon Gmail
 * d'un brouillon IA édité (Sprint 26 PR4).
 *
 * HTTP onRequest callable depuis l'admin. Selon mode :
 *  - mode='send'         : envoie le mail via Gmail API (scope gmail.send)
 *  - mode='draft_gmail'  : crée un brouillon Gmail (scope gmail.modify)
 *
 * Pattern atomicité serveur (cf feedback_pattern_atomicite_firestore_serveur) :
 * la CF fait l'appel Gmail API ET met à jour Firestore message_drafts.
 * Le client ne fait que l'appel à la CF avec son draft_text édité.
 *
 * Région : europe-west1.
 * Secrets : GMAIL_CLIENT_SECRET, GMAIL_REFRESH_TOKEN.
 *
 * Body attendu :
 *   {
 *     messageId: string,
 *     draft_text: string,        // texte final édité par l'user
 *     subject?: string,          // sujet final (sinon dérivé du draft)
 *     mode: 'send' | 'draft_gmail',
 *   }
 *
 * Réponse :
 *   { ok: true, gmailId?, draftId?, threadId? }
 */

const {onRequest} = require("firebase-functions/v2/https");
const {logger} = require("firebase-functions");
const {db, admin} = require("../lib/firebase-admin");
const {requireRole} = require("../lib/admin-auth");
const {ALLOWED_ORIGINS} = require("../lib/cors");
const {
  createGmailClientAuto,
  sendMessage,
  createDraft,
} = require("../lib/gmail-client");
// Sprint 95 — adresse et nom d'envoi de la personne qui traite.
const {resolveSender} = require("../lib/sender-identity");
const {validateRecipients} = require("../lib/email-validate");
const {withSimpleHtmlBody} = require("../lib/email-html");
// Sprint 103 (posts 2, 4 et 9) — adresse d'envoi non autorisée signalée,
// signature de la personne posée, historique cité sous la réponse.
const {senderBlockMessage} = require("../lib/sender-identity");
const {personalizeSignature} = require("../lib/sender-signature");
const {readResponseSettings} = require("../lib/response-settings");
const {readThreadMessages, sortThreadChronological, toMillis} = require("../lib/thread-reader");
const {pickQuotedMessage, pickQuotedThread, exchangesWith, withQuotedHistory, fetchThreadingHeaders} = require("../lib/reply-quote");
const {findPlaceholders} = require("../lib/draft-facts");
// Quantique : la branche Trendl « nouvel e-mail de prospection » (Sprint 104,
// création d'une négociation CRM à l'envoi) est retirée. Cette fonction ne
// sert qu'à RÉPONDRE dans un fil existant.

const VALID_MODES = new Set(["send", "draft_gmail"]);

// Sprint 88 (retour Max n°3) — pièces jointes. Bornes volontairement basses :
// au-delà, Gmail et les anti-spam commencent à refuser, et la Cloud Function
// doit charger les fichiers en mémoire. 5 fichiers / 10 Mo au total couvrent
// le besoin réel (un contrat, un média kit, quelques visuels).
const MAX_ATTACHMENTS = 5;
const MAX_ATTACHMENTS_TOTAL_BYTES = 10 * 1024 * 1024;
// Les fichiers joignables ne peuvent venir QUE de ce dossier du coffre. Sans
// ce verrou, un appel pourrait demander à joindre n'importe quel fichier du
// bucket (factures, statistiques créateurs…) — principe du moindre privilège.
const ATTACHMENT_PREFIX = "outgoing_attachments/";

/**
 * Charge les pièces jointes depuis Storage et les encode en base64.
 * Valide le dossier d'origine, le nombre et le poids total.
 *
 * @param {Array<{storagePath: string, filename?: string}>} list
 * @return {Promise<Array<{filename: string, mimeType: string,
 *   contentBase64: string, sizeBytes: number}>>}
 */
async function loadAttachments(list) {
  if (!Array.isArray(list) || list.length === 0) return [];
  if (list.length > MAX_ATTACHMENTS) {
    const err = new Error(
        `Trop de pièces jointes (${list.length}) : ${MAX_ATTACHMENTS} maximum.`,
    );
    err.status = 400;
    throw err;
  }

  const bucket = admin.storage().bucket();
  const loaded = [];
  let totalBytes = 0;

  for (const item of list) {
    const storagePath = item && typeof item.storagePath === "string" ?
      item.storagePath.trim() :
      "";
    if (!storagePath.startsWith(ATTACHMENT_PREFIX) ||
        storagePath.includes("..")) {
      const err = new Error("Chemin de pièce jointe non autorisé.");
      err.status = 400;
      throw err;
    }
    const file = bucket.file(storagePath);
    const [exists] = await file.exists();
    if (!exists) {
      const err = new Error("Pièce jointe introuvable dans le coffre.");
      err.status = 404;
      throw err;
    }
    const [meta] = await file.getMetadata();
    const sizeBytes = Number(meta.size || 0);
    totalBytes += sizeBytes;
    if (totalBytes > MAX_ATTACHMENTS_TOTAL_BYTES) {
      const err = new Error(
          "Pièces jointes trop lourdes (10 Mo au total maximum).",
      );
      err.status = 400;
      throw err;
    }
    const [buffer] = await file.download();
    loaded.push({
      filename:
        (item.filename && String(item.filename)) ||
        storagePath.split("/").pop(),
      mimeType: meta.contentType || "application/octet-stream",
      contentBase64: buffer.toString("base64"),
      sizeBytes,
    });
  }
  return loaded;
}

exports.sendReplyDraft = onRequest(
  {
    region: "europe-west1",
    secrets: ["GMAIL_CLIENT_SECRET", "GMAIL_REFRESH_TOKEN"],
    cors: ALLOWED_ORIGINS,
    // Sprint 95 (bug du 11/10 : « HTTP 500 — Internal Server Error » avec
    // 5 captures, mail pourtant parti) — un mail avec pièces jointes est
    // copié plusieurs fois en mémoire (lecture, base64, MIME, encodage
    // Gmail) : 256 Mo ne suffisaient plus et l'instance tombait après
    // l'envoi. On donne de l'air, en mémoire comme en temps.
    memory: "1GiB",
    timeoutSeconds: 120,
    invoker: "public",
  },
  async (req, res) => {
    if (req.method !== "POST") {
      return res.status(405).json({error: "Method not allowed"});
    }

    let adminEmail;
    let adminUid;
    try {
      const principal = await requireRole(req, "admin");
      adminEmail = principal.email;
      adminUid = principal.uid;
    } catch (authErr) {
      return res
        .status(authErr.status || 401)
        .json({error: authErr.message});
    }

    try {
      const {
        messageId,
        draft_text: draftText,
        subject,
        mode,
        recipients,
        cc,
        bcc,
        // Sprint 88 — [{storagePath, filename}] déposés par le navigateur dans
        // le coffre avant l'envoi.
        attachments,
        // Sprint 103 — historique cité sous la réponse (oui par défaut).
        quote_history: quoteHistory = true,
      } = req.body || {};

      if (!messageId || typeof messageId !== "string") {
        return res.status(400).json({error: "messageId requis (string)"});
      }
      if (!draftText || typeof draftText !== "string") {
        return res.status(400).json({error: "draft_text requis (string)"});
      }
      if (!VALID_MODES.has(mode)) {
        return res.status(400).json({
          error: `mode invalide (attendu : ${[...VALID_MODES].join(" | ")})`,
        });
      }

      // 1. Lecture du message original (pour from/threadId)
      const msgSnap = await db.collection("messages").doc(messageId).get();
      if (!msgSnap.exists) {
        return res.status(404).json({error: `Message ${messageId} introuvable`});
      }
      const message = msgSnap.data();

      // 2. Récupère le refresh token Gmail (1 seul admin partagé pour V1).
      //    En V2 multi-comptes, on lira un token par admin uid.
      // Sprint 82 (B157) — créds résolues via le compte exploitant (repli global).
      const gmail = await createGmailClientAuto();

      // 3. Récupère l'identité Gmail authentifiée (= le From du mail envoyé)
      const profile = await gmail.users.getProfile({userId: "me"});
      const sender = await resolveSender(gmail, adminUid, profile.data.emailAddress, logger);
      const fromAddress = sender.from;
      // Sprint 103 (post 2) — adresse d'envoi demandée mais pas autorisée
      // dans Gmail : on ne part plus en silence depuis la boîte de Max.
      const blockMsg = senderBlockMessage(sender);
      if (blockMsg) {
        return res.status(409).json({error: blockMsg, code: "sender_not_enabled"});
      }
      // Sprint 103 (post 6) — un espace réservé oublié bloque l'envoi.
      const holes = findPlaceholders(draftText);
      if (mode === "send" && holes.length > 0) {
        return res.status(400).json({
          error: `Il reste une information à compléter dans le message : ${holes.join(", ")}.`,
          code: "placeholder_left",
        });
      }
      // Sprint 103 (post 2) — signature de la personne qui envoie.
      let finalText = draftText;
      if (sender.signature || sender.name) {
        let defaultSignature = "";
        try {
          defaultSignature = (await readResponseSettings()).signature || "";
        } catch (settingsErr) {
          logger.warn("sendReplyDraft: réglages de réponse illisibles", {error: settingsErr.message});
        }
        finalText = personalizeSignature(draftText, sender, {defaultSignature});
      }

      // 4. Construit le payload
      // Sprint 26.5 PR1 : `recipients` (string ou array) peut override le From
      // original. Le client envoie une string multi-emails (séparés par
      // virgule) depuis le champ "À" éditable du drawer. Si absent, on
      // fallback sur le From du mail reçu (= la personne qui nous a écrit).
      const replySubject = subject || deriveReplySubject(message.subject);
      // Sprint 29 — fallback Reply-To EN PRIORITÉ sur le From. Les emails
      // relayés (formulaire de contact via Resend) ont un From technique
      // (onboarding@resend.dev) mais l'adresse réelle dans Reply-To.
      const recipient =
        normalizeRecipients(recipients) ||
        message.reply_to ||
        message.from ||
        "";
      // Sprint 29 — validation des destinataires. Une adresse mal formée
      // (ex : « ...@saint-gobain » sans TLD) renvoyait un « Invalid To
      // header » Gmail opaque en HTTP 500. On renvoie désormais un 400 clair.
      const {invalid} = validateRecipients(recipient);
      if (!recipient || invalid.length > 0) {
        return res.status(400).json({
          error: invalid.length ?
            `Adresse(s) destinataire invalide(s) : ${invalid.join(", ")}` :
            "Aucun destinataire valide.",
        });
      }
      // Sprint 86 — Cc optionnel : normalise + valide comme le "A". Une
      // adresse Cc mal formee renvoie un 400 clair (pas un 500 Gmail opaque).
      const ccRecipient = normalizeRecipients(cc);
      if (ccRecipient) {
        const {invalid: ccInvalid} = validateRecipients(ccRecipient);
        if (ccInvalid.length > 0) {
          return res.status(400).json({
            error: `Adresse(s) en copie invalide(s) : ${ccInvalid.join(", ")}`,
          });
        }
      }
      // Sprint 86 — Bcc optionnel : normalisé + validé comme le Cc.
      const bccRecipient = normalizeRecipients(bcc);
      if (bccRecipient) {
        const {invalid: bccInvalid} = validateRecipients(bccRecipient);
        if (bccInvalid.length > 0) {
          return res.status(400).json({
            error: `Adresse(s) en copie cachée invalide(s) : ${bccInvalid.join(", ")}`,
          });
        }
      }
      // Sprint 88 — chargement des pièces jointes depuis le coffre. Une erreur
      // ici (chemin refusé, fichier trop lourd) renvoie un message clair AVANT
      // tout appel Gmail : on n'envoie jamais un mail à moitié constitué.
      let loadedAttachments = [];
      try {
        loadedAttachments = await loadAttachments(attachments);
      } catch (attachErr) {
        return res
            .status(attachErr.status || 400)
            .json({error: attachErr.message});
      }

      const payload = {
        from: fromAddress,
        to: recipient,
        cc: ccRecipient || undefined,
        bcc: bccRecipient || undefined,
        subject: replySubject,
        bodyText: finalText,
        threadId: message.threadId || message.thread_id || undefined,
        attachments: loadedAttachments,
      };
      // Sprint 103 (posts 4 et 9) — historique : le dernier message du fil
      // est cité sous la réponse (comme « Répondre » dans Gmail), et les
      // en-têtes de conversation rangent la réponse dans le bon fil chez le
      // destinataire. Best-effort : sans fil lisible, la réponse part seule.
      let quoted = null;
      if (quoteHistory !== false && payload.threadId) {
        try {
          const thread = sortThreadChronological(await readThreadMessages(db, payload.threadId, 60))
              .filter((m) => !(m.labels || []).includes("DRAFT"));
          // Sprint 104 (post 5) — TOUT le fil échangé avec le destinataire
          // (jamais un échange interne), du plus récent au plus ancien.
          const firstTo = String(recipient).split(",")[0];
          const withThem = exchangesWith(thread, firstTo);
          const list = pickQuotedThread(withThem.length ? withThem : thread, toMillis);
          quoted = list.length ? list :
            pickQuotedMessage(thread.length ? thread : [{id: messageId, ...message}], toMillis);
        } catch (threadErr) {
          logger.warn("sendReplyDraft: fil illisible, envoi sans historique", {messageId, error: threadErr.message});
        }
        const head = Array.isArray(quoted) ? quoted[0] : quoted;
        if (head) Object.assign(payload, await fetchThreadingHeaders(gmail, head.gmailId));
      }
      // Sprint 90 (retour Max 14/08) — on double le texte brut d'une version
      // HTML a police fixe : le mail s'affiche pareil chez tous les
      // destinataires, quel que soit leur client mail.
      const hasQuote = Array.isArray(quoted) ? quoted.length > 0 : Boolean(quoted);
      const htmlPayload = hasQuote ? withQuotedHistory(payload, quoted) : withSimpleHtmlBody(payload);

      // 5. Envoi OU brouillon
      let gmailResult;
      // Sprint 95 (bug signalé le 11/10 : « Requested entity was not found »)
      // — le fil Gmail d'origine est inconnu du compte qui envoie (mail reçu
      // sur une autre boîte, fil supprimé) : on renvoie hors fil plutôt que
      // d'échouer. Le sujet « Re: … » garde la conversation lisible.
      const isNotFound = (err) =>
        Number(err?.code || err?.status || err?.response?.status) === 404 ||
        /Requested entity was not found/i.test(String(err?.message || ""));
      const run = (p) => (mode === "send" ? sendMessage(gmail, p) : createDraft(gmail, p));
      try {
        gmailResult = await run(htmlPayload);
      } catch (gmailErr) {
        if (!htmlPayload.threadId || !isNotFound(gmailErr)) throw gmailErr;
        logger.warn("sendReplyDraft: fil Gmail introuvable, envoi hors fil", {messageId});
        gmailResult = await run({...htmlPayload, threadId: undefined, inReplyTo: undefined, references: undefined});
      }
      const feedbackValue = mode === "send" ? "envoyé" : "brouillon_gmail";

      // 6. Update Firestore message_drafts pour l'audit + feedback.
      // Sprint 95 — le mail est PARTI : un échec d'audit ne doit plus faire
      // croire à l'utilisateur que l'envoi a échoué (risque de double envoi).
      try {
        await db.collection("message_drafts").doc(messageId).set(
          {
            last_action: feedbackValue,
            last_action_at: admin.firestore.FieldValue.serverTimestamp(),
            last_action_by_uid: adminUid,
            last_action_by_email: adminEmail,
            last_gmail_id: gmailResult.id || gmailResult.messageId || null,
            last_thread_id: gmailResult.threadId || null,
            feedback: feedbackValue,
            // Sprint 88 — trace des fichiers réellement envoyés (audit).
            last_attachments: loadedAttachments.map((a) => ({
              filename: a.filename,
              mime_type: a.mimeType,
              size_bytes: a.sizeBytes,
            })),
            last_from: sender.email,
            last_quoted_message_id: (Array.isArray(quoted) ? (quoted[0] || {}).gmailId : quoted && quoted.gmailId) || null,
          },
          {merge: true},
        );
      } catch (auditErr) {
        logger.error("sendReplyDraft: mail envoyé, audit en échec", {messageId, error: auditErr.message});
      }

      logger.info("sendReplyDraft: completed", {
        messageId,
        mode,
        gmailId: gmailResult.id,
        threadId: gmailResult.threadId,
        attachmentsCount: loadedAttachments.length,
      });

      return res.status(200).json({
        ok: true,
        mode,
        gmailId: gmailResult.id,
        messageId: gmailResult.messageId || null,
        threadId: gmailResult.threadId || null,
      });
    } catch (err) {
      logger.error("sendReplyDraft error", {
        error: err.message,
        stack: err.stack,
      });
      return res.status(500).json({error: err.message});
    }
  },
);

/**
 * Dérive un sujet "Re: <original>" si pas déjà préfixé.
 */
function deriveReplySubject(originalSubject) {
  const subject = (originalSubject || "").trim();
  if (!subject) return "Re: (sans sujet)";
  if (/^re\s*:/i.test(subject)) return subject;
  return `Re: ${subject}`;
}

/**
 * Sprint 26.5 PR1 — Normalise une liste de destinataires reçue depuis
 * le client. Accepte une string multi-emails (séparés par virgule ou
 * point-virgule) ou un array. Retourne une string RFC 2822 valide à
 * passer au header To: (les virgules dans un header To: sont autorisées).
 * Retourne null si aucune entrée valide.
 *
 * @param {string|string[]|undefined|null} input
 * @return {string|null}
 */
function normalizeRecipients(input) {
  if (!input) return null;
  const raw = Array.isArray(input) ? input.join(",") : String(input);
  const parts = raw
    .split(/[,;]/)
    .map((s) => s.trim())
    .filter(Boolean);
  if (parts.length === 0) return null;
  return parts.join(", ");
}
