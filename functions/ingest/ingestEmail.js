/**
 * Cloud Function ingestEmail — trigger Pub/Sub.
 *
 * Déclenchée par Gmail à chaque nouveau message arrivant dans INBOX.
 * Récupère les messages depuis le dernier historyId connu, les parse,
 * et les écrit dans Firestore sous /messages/{gmailId}.
 *
 * Idempotente : la clé du doc Firestore = gmailId, donc relivraison Pub/Sub
 * ne duplique pas (overwrite avec mêmes données).
 *
 * Sprint 11 :
 *   - Migration console.log → logger.info/warn/error pour logs structurés.
 *   - Log du payload Pub/Sub brut pour identifier le bon nom de champ historyId.
 *   - Gestion des variantes connues : historyId, history_id, historyID.
 *
 * Variables d'environnement : GMAIL_CLIENT_ID, GMAIL_REDIRECT_URI
 * Secrets : GMAIL_CLIENT_SECRET, GMAIL_REFRESH_TOKEN
 */

const { onMessagePublished } = require("firebase-functions/v2/pubsub");
const { logger } = require("firebase-functions");
const { db, admin } = require("../lib/firebase-admin");
const {
  createGmailClientAuto,
  listHistory,
  withGmailBackoff,
  modifyLabels,
} = require("../lib/gmail-client");
// Sprint 95 — domaines mis directement en spam (libero.it…).
const {readSpamSettings, spamDomainOf} = require("../lib/spam-domains");
const { resolveReplyTo } = require("../lib/contact-reply");
const { advanceHistoryCursor } = require("../lib/history-cursor");
const {
  isQuarantined,
  recordPoisonAttempt,
  clearPoisonTracking,
} = require("../lib/dead-letter");
const {isDraftMessage, messageDirection} = require("../lib/message-direction");

const WATCH_DOC = "system/gmail-watch";

/**
 * Extrait le historyId d'un payload Gmail notification, en testant
 * toutes les variantes connues du nom de champ.
 * @param {object} notification
 * @returns {string|undefined}
 */
function extractNotificationHistoryId(notification) {
  return (
    notification.historyId ||
    notification.history_id ||
    notification.historyID ||
    notification.HistoryId ||
    undefined
  );
}

exports.ingestEmail = onMessagePublished(
  {
    topic: process.env.GMAIL_PUBSUB_TOPIC_NAME || "quantique-emails-inbound",
    secrets: ["GMAIL_CLIENT_SECRET", "GMAIL_REFRESH_TOKEN"],
  },
  async (event) => {
    try {
      // 1. Décoder le payload Pub/Sub
      const rawData = event.data.message.data || "";
      const decoded = Buffer.from(rawData, "base64").toString("utf8");
      const notification = JSON.parse(decoded || "{}");

      // Log structuré du payload brut. A5 : on ne logue PAS le contenu de la
      // notification (elle contient l'adresse de la boîte) — uniquement les noms
      // de champs et la taille, suffisants pour le debug.
      logger.info("Gmail notification received", {
        keys: Object.keys(notification),
        rawBase64Length: rawData.length,
      });

      const notificationHistoryId = extractNotificationHistoryId(notification);

      // Sprint 82.1 — FILTRE DE BOÎTE : la notification Gmail porte l'adresse
      // de la boîte concernée. Si ce n'est pas la boîte actuellement écoutée
      // (watch_email, écrit par performWatch), on l'ignore : c'est l'ancienne
      // boîte dont le watch n'a pas encore expiré chez Google. Sans ce filtre,
      // son historyId (numérotation d'une AUTRE boîte) écrase le curseur et
      // bloque la lecture de la nouvelle boîte.
      const notificationEmail =
        typeof notification.emailAddress === "string"
          ? notification.emailAddress.toLowerCase()
          : null;

      // 2. Lire le lastHistoryId connu
      // Ordre : lastHistoryId (écrit par les ingestions précédentes)
      //       > watchHistoryId (écrit par startWatch au 1er appel)
      //       > notificationHistoryId (fallback, ne devrait jamais être seul)
      const watchSnap = await db.doc(WATCH_DOC).get();
      const data = watchSnap.exists ? watchSnap.data() : {};

      // Sprint 82.1 — application du filtre de boîte (voir plus haut). A5 :
      // aucune adresse en clair dans les logs.
      if (
        data.watch_email &&
        notificationEmail &&
        notificationEmail !== data.watch_email
      ) {
        logger.info("ingestEmail: notification d'une ancienne boîte, ignorée", {
          matchesWatchedMailbox: false,
        });
        return;
      }

      const lastHistoryId =
        data.lastHistoryId || data.watchHistoryId || notificationHistoryId;

      logger.info("Using startHistoryId", {
        startHistoryId: lastHistoryId,
        source:
          data.lastHistoryId ? "lastHistoryId"
          : data.watchHistoryId ? "watchHistoryId"
          : "notification",
      });

      // 3. Créer le client Gmail (refresh token via Secret Manager)
      // Sprint 82 (B157) — créds résolues via le compte exploitant (repli global).
      const gmail = await createGmailClientAuto();

      // 4. Lister les changements depuis lastHistoryId
      const history = await listHistory(gmail, lastHistoryId);
      logger.info(`History entries fetched`, { count: history.length });

      // 5. Pour chaque message ajouté → fetch + écriture Firestore.
      // M04-R3 (dead-letter) : un message qui plante en boucle est mis en
      // quarantaine après N tentatives au lieu de bloquer toute la file.
      let ingestedCount = 0;
      for (const entry of history) {
        if (!entry.messagesAdded) continue;
        for (const added of entry.messagesAdded) {
          const gmailId = added.message.id;

          // Déjà en quarantaine → on l'ignore (la file ne doit pas se rebloquer).
          if (await isQuarantined({ db }, gmailId)) {
            logger.warn("ingestEmail: message en quarantaine, ignoré", { gmailId });
            continue;
          }

          try {
            const ingested = await ingestSingleMessage(gmail, gmailId);
            if (ingested) {
              ingestedCount++;
              // Nettoie un éventuel échec transitoire passé (best-effort).
              await clearPoisonTracking({ db }, gmailId).catch(() => {});
            }
          } catch (err) {
            const { attempts, quarantined } = await recordPoisonAttempt(
              { db, admin },
              gmailId,
              err,
            );
            if (quarantined) {
              // Seuil atteint : on écarte ce message et on CONTINUE le batch
              // (la file reprend) — le message reste tracé pour inspection.
              logger.error("ingestEmail: message poison mis en quarantaine", {
                gmailId,
                attempts,
                error: err.message,
              });
              continue;
            }
            // Sous le seuil : on propage pour laisser Pub/Sub rejouer (l'échec
            // peut être transitoire). Le compteur progressera à chaque rejeu.
            throw err;
          }
        }
      }

      // 6. Avancer le pointeur lastHistoryId — M04-R5 : en TRANSACTION avec une
      // garde MONOTONE (jamais reculer le curseur, même en rejeux concurrents).
      // Si notificationHistoryId est undefined, on retombe sur le dernier id
      // d'historique, puis sur l'existant (on ne l'efface jamais).
      const nextHistoryId =
        notificationHistoryId ||
        (history.length > 0 ? history[history.length - 1].id : undefined) ||
        data.lastHistoryId ||
        data.watchHistoryId;

      if (nextHistoryId) {
        const { advanced, current } = await advanceHistoryCursor(
          { db, admin },
          db.doc(WATCH_DOC),
          nextHistoryId,
          { lastIngestedCount: ingestedCount },
        );
        logger.info("Watch state updated", {
          lastHistoryId: advanced ? nextHistoryId : current,
          advanced,
          ingestedCount,
        });
      } else {
        logger.warn("Could not determine nextHistoryId — watch state NOT updated");
      }
    } catch (err) {
      logger.error("ingestEmail error", { error: err.message, stack: err.stack });
      throw err; // throw = Pub/Sub retry automatique
    }
  },
);

/**
 * Fetch un message Gmail complet et l'écrit dans /messages/{gmailId}.
 *
 * Gère gracieusement les 404 ("Requested entity was not found.") :
 * Gmail retourne 404 si le message a été supprimé, déplacé hors INBOX par
 * un filtre auto, ou purgé de l'historique entre la notification Pub/Sub
 * et notre fetch. Dans ce cas on skip silencieusement pour ne pas bloquer
 * tout le rattrapage des messages suivants.
 *
 * Sprint 12 fix : sans cette protection, un seul mail mort dans l'historique
 * bloquait l'ingestion de tous les mails légitimes après lui (boucle
 * Pub/Sub retry → re-plante → lastHistoryId jamais mis à jour).
 *
 * @param {import("googleapis").gmail_v1.Gmail} gmail
 * @param {string} gmailId
 * @return {Promise<boolean>} true si le message a été ingéré, false s'il a été
 *   skippé (404 : supprimé/filtré/purgé). Toute autre erreur est propagée.
 */
// Réglages du tri, relus au plus toutes les minutes (une rafale de mails ne
// relit pas le doc à chaque message).
let spamSettingsCache = {at: 0, value: null};
async function spamSettings() {
  if (spamSettingsCache.value && Date.now() - spamSettingsCache.at < 60000) {
    return spamSettingsCache.value;
  }
  try {
    const value = await readSpamSettings(db);
    spamSettingsCache = {at: Date.now(), value};
    return value;
  } catch (err) {
    logger.warn("ingestSingleMessage: réglages du tri illisibles", {error: err.message});
    return {spam_domains: []};
  }
}

async function ingestSingleMessage(gmail, gmailId) {
  let res;
  try {
    // M04-R6 — fetch protégé par le backoff quota Gmail (Retry-After).
    res = await withGmailBackoff(() =>
      gmail.users.messages.get({
        userId: "me",
        id: gmailId,
        format: "full",
      }),
    );
  } catch (err) {
    const status = err.code || err.response?.status;
    const isNotFound =
      status === 404 ||
      status === "404" ||
      /not found/i.test(err.message || "");
    if (isNotFound) {
      logger.warn(
        "ingestSingleMessage: Gmail returned 404, skipping (deleted/filtered/purged)",
        { gmailId, error: err.message },
      );
      return false; // Skip silencieusement, on continue avec les autres messages
    }
    // Autre erreur : on propage (retry Pub/Sub légitime)
    throw err;
  }
  const msg = res.data;

  // Sprint 83 — un brouillon Gmail n'est pas de la correspondance : on ne
  // l'ingère pas (les brouillons successifs polluaient le fil en doublons).
  const labels = msg.labelIds || [];
  if (isDraftMessage(labels)) {
    logger.info("ingestSingleMessage: brouillon Gmail ignoré (non ingéré)", {
      gmailId,
    });
    return false;
  }

  // Headers → map lowercase
  const headers = {};
  for (const h of msg.payload.headers || []) {
    headers[h.name.toLowerCase()] = h.value;
  }

  const { bodyText, bodyHtml } = extractBody(msg.payload);

  // Sprint 78 — pièces jointes : on capture les MÉTADONNÉES seulement
  // (nom, type, taille, id Gmail). Le contenu n'est PAS téléchargé à
  // l'ingestion (coût/poids) : il le sera à la demande par le module
  // « facture créateur » (matchEmailInvoice) via l'API Gmail.
  const attachments = extractAttachmentsMeta(msg.payload);

  const doc = {
    gmailId,
    threadId: msg.threadId,
    from: headers["from"] || "",
    to: (headers["to"] || "")
      .split(",")
      .map((s) => s.trim())
      .filter(Boolean),
    // Sprint 88 (retour Max n°1 du 29/07) — le champ Cc était jeté à
    // l'ingestion. Or quand Max est en copie (ou en copie cachée) d'un échange
    // marque ↔ créateur, l'identité du créateur ne vit QUE dans l'enveloppe du
    // mail. Sans ce champ, impossible de savoir de qui on parle.
    cc: (headers["cc"] || "")
      .split(",")
      .map((s) => s.trim())
      .filter(Boolean),
    subject: headers["subject"] || "",
    snippet: msg.snippet || "",
    bodyText,
    bodyHtml,
    labels,
    // Sprint 83 — entrant / sortant, dérivé des labels Gmail.
    direction: messageDirection(labels),
    attachments,
    // Sprint 82 (B102) — signal newsletter : présence du header
    // List-Unsubscribe (les emails de masse l'embarquent quasi tous).
    // Booléen seulement : on ne stocke pas l'URL de désinscription.
    has_list_unsubscribe: Boolean(headers["list-unsubscribe"]),
    // Notification automatique envoyée par l'application elle-même.
    app_notification: Boolean(headers["x-app-notification"]),
    receivedAt: msg.internalDate
      ? admin.firestore.Timestamp.fromMillis(parseInt(msg.internalDate, 10))
      : null,
    ingestedAt: admin.firestore.FieldValue.serverTimestamp(),
  };

  // Sprint 29 — Adresse de réponse calculée une fois pour toutes :
  //  - mail de formulaire Trendl ([Trendl Contact] dans le sujet) → adresse
  //    SAISIE dans le formulaire (extraite du corps), pas l'expéditeur
  //    technique Resend (onboarding@resend.dev).
  //  - sinon → header Reply-To si présent, sinon expéditeur.
  // Tout l'aval (pré-remplissage drawer + envoi) lit ce champ reply_to.
  doc.reply_to = resolveReplyTo(doc, headers["reply-to"] || "");

  // Sprint 95 (Mickaël 11/10) — expéditeur d'un domaine mis en spam : le
  // mail va dans Spam (application et Gmail), sans analyse IA.
  if (doc.direction !== "outbound" && !labels.includes("SPAM")) {
    const spamDomain = spamDomainOf(doc.from, await spamSettings());
    if (spamDomain) {
      doc.labels = [...labels.filter((l) => l !== "INBOX" && l !== "UNREAD"), "SPAM"];
      doc.spam_filtered = {domain: spamDomain, at: admin.firestore.FieldValue.serverTimestamp()};
      try {
        await modifyLabels(gmail, gmailId, {add: ["SPAM"], remove: ["INBOX", "UNREAD"]});
      } catch (err) {
        logger.warn("ingestSingleMessage: mise en spam Gmail impossible", {gmailId, error: err.message});
      }
      logger.info("ingestSingleMessage: domaine mis en spam", {gmailId, domain: spamDomain});
    }
  }

  await db.collection("messages").doc(gmailId).set(doc, { merge: true });
  // A5 : on ne logue pas le sujet du mail (contenu personnel) — seul l'id Gmail.
  logger.info("Ingested message", { gmailId });
  return true;
}

/**
 * Extrait body texte et HTML d'un payload Gmail (récursif sur les parts).
 * @param {object} payload
 * @returns {{bodyText: string, bodyHtml: string}}
 */
/**
 * Extrait les métadonnées des pièces jointes d'un payload Gmail (récursif).
 * Une pièce jointe « réelle » a un filename ET un body.attachmentId (les
 * images inline sans filename sont ignorées).
 *
 * @param {object} payload
 * @return {Array<{filename: string, mimeType: string, sizeBytes: number,
 *   gmailAttachmentId: string}>}
 */
function extractAttachmentsMeta(payload) {
  const out = [];

  function walk(part) {
    if (!part) return;
    if (part.filename && part.body && part.body.attachmentId) {
      out.push({
        filename: part.filename,
        mimeType: part.mimeType || "",
        sizeBytes: Number(part.body.size || 0),
        gmailAttachmentId: part.body.attachmentId,
      });
    }
    if (part.parts) {
      for (const child of part.parts) walk(child);
    }
  }

  walk(payload);
  return out;
}

function extractBody(payload) {
  let bodyText = "";
  let bodyHtml = "";

  function walk(part) {
    if (!part) return;
    if (part.mimeType === "text/plain" && part.body && part.body.data) {
      bodyText += Buffer.from(part.body.data, "base64").toString("utf8");
    } else if (part.mimeType === "text/html" && part.body && part.body.data) {
      bodyHtml += Buffer.from(part.body.data, "base64").toString("utf8");
    }
    if (part.parts) {
      for (const child of part.parts) walk(child);
    }
  }

  walk(payload);
  return { bodyText, bodyHtml };
}
