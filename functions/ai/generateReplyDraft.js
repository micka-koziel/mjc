/**
 * generateReplyDraft — brouillon de réponse IA à un fil d'e-mails.
 *
 * Reprend le déroulé de la fonction Trendl du même nom (Sprint 26 → 104) :
 *  1. lecture du message demandé, puis de TOUT le fil (60 messages max) ;
 *  2. cible = dernier message du fil : entrant → « reply », sortant →
 *     « relance » (lib/reply-target.js, repris tel quel) ;
 *  3. Cc suggérés « répondre à tous » (lib/reply-cc.js, repris) ;
 *  4. génération structurée validée (zod) avec garde-fous budget et
 *     anti-injection (lib/ai-provider.js, repris) ;
 *  5. liens / téléphones / adresses absents des sources signalés et
 *     confiance abaissée (lib/draft-facts.js, repris) ;
 *  6. brouillon rangé dans message_drafts/{messageId} (même document que
 *     Trendl, lu par l'écran pour un affichage instantané).
 *
 * Retiré (CRM / Trendl) : grilles tarifaires et fiches des créateurs,
 * acteurs reconnus dans le CRM, sollicitations sans budget, prospection,
 * profil de voix appris. Ajouté : préférences d'assistant de la
 * configuration (ton, concision, langue) reçues dans `assistant`.
 *
 * Body : {messageId, instruction?, assistant?: {tone, concision, language}}
 */
const {onRequest} = require("firebase-functions/v2/https");
const {logger} = require("firebase-functions");
const {db, admin} = require("../lib/firebase-admin");
const {requireRole} = require("../lib/admin-auth");
const {ALLOWED_ORIGINS} = require("../lib/cors");
const {maskEmail} = require("../lib/log-redact");
const {getAnthropicClient, MODEL_SONNET} = require("../lib/anthropic-client");
const {generateStructured} = require("../lib/ai-provider");
const {replyDraftOutputSchema} = require("../lib/validation/ai-schemas");
const {readResponseSettings} = require("../lib/response-settings");
const {readThreadMessages, sortThreadChronological, toMillis} = require("../lib/thread-reader");
const {resolveReplyTargetAndKind} = require("../lib/reply-target");
const {suggestReplyCc} = require("../lib/reply-cc");
const {findUnverifiedFacts} = require("../lib/draft-facts");
const {publicAiError} = require("../lib/text-safe");
const {messageDirection} = require("../lib/message-direction");
const {buildReplySystem, buildThreadUser, TOOL_REPLY} = require("../lib/prompts-generic");
const {loadAiProfile} = require("../lib/ai-profile");

/** Nettoyage typographique léger (sans retirer les espaces réservés). Pur. */
function tidyDraft(text) {
  return String(text || "")
      .replace(/[ \t]+$/gm, "")
      .replace(/[ \t]{2,}/g, " ")
      .replace(/\n{3,}/g, "\n\n")
      .trim();
}

/** Message utilisateur envoyé à l'IA. Pur (exporté pour les tests). */
function buildReplyUser({ordered, target, mode, instruction}) {
  const thread = buildThreadUser(
      ordered.slice(-8).map((m) => ({
        ...m,
        direction: messageDirection(m.labels),
        receivedAtIso: toMillis(m.receivedAt) ? new Date(toMillis(m.receivedAt)).toISOString().slice(0, 16) : "",
      })),
  );
  return [
    `Conversation (du plus ancien au plus récent) :\n${thread}`,
    "",
    mode === "relance" ?
      "La personne a écrit en dernier et attend une réponse : propose une relance courtoise." :
      `Réponds au dernier message reçu (de : ${target.from || "?"}).`,
    instruction ? `Consigne de l'utilisateur (prioritaire) : ${instruction}` : "",
  ].filter(Boolean).join("\n");
}

exports.generateReplyDraft = onRequest(
    {
      region: "europe-west1",
      secrets: ["ANTHROPIC_API_KEY"],
      cors: ALLOWED_ORIGINS,
      timeoutSeconds: 120,
      invoker: "public",
    },
    async (req, res) => {
      if (req.method !== "POST") return res.status(405).json({error: "Method not allowed"});
      let principal;
      try {
        principal = await requireRole(req);
      } catch (authErr) {
        return res.status(authErr.status || 401).json({error: authErr.message});
      }
      try {
        const messageId = req.body?.messageId;
        const instruction = typeof req.body?.instruction === "string" ? req.body.instruction.trim().slice(0, 1000) : "";
        const prefs = req.body?.assistant && typeof req.body.assistant === "object" ? req.body.assistant : {};
        if (!messageId || typeof messageId !== "string") return res.status(400).json({error: "messageId requis (string)"});

        const snap = await db.collection("messages").doc(messageId).get();
        if (!snap.exists) return res.status(404).json({error: "Message introuvable."});
        const requested = {id: snap.id, ...snap.data()};
        const threadId = requested.threadId || requested.thread_id;
        let ordered = threadId ? sortThreadChronological(await readThreadMessages(db, threadId, 60)) : [];
        if (!ordered.length) ordered = [requested];

        const t = resolveReplyTargetAndKind(ordered);
        const target = t.target || requested;
        const mode = t.kind;
        const recipient = t.recipient || "";
        const ccSuggested = suggestReplyCc(target, recipient || target.from || "", ordered);
        const settings = await readResponseSettings().catch(() => ({}));

        const client = await getAnthropicClient();
        const started = Date.now();
        const draft = await generateStructured(client, {
          model: MODEL_SONNET,
          system: buildReplySystem(prefs, settings),
          user: buildReplyUser({ordered, target, mode, instruction}),
          tool: TOOL_REPLY,
          schema: replyDraftOutputSchema,
          maxTokens: 1500,
          label: "generateReplyDraft",
        });
        const body = tidyDraft(draft.body);
        const factWarnings = findUnverifiedFacts(body, {
          // La signature du client (téléphone…) n'est pas un « fait inventé ».
          texts: [...ordered.map((m) => m.bodyText || m.snippet || ""), instruction, settings.signature || "", loadAiProfile().assistant?.signatureText || ""],
        });
        const confidence = factWarnings.length ? Math.min(Number(draft.confidence) || 0, 0.4) : draft.confidence;

        const out = {
          recipient,
          cc_suggested: ccSuggested,
          kind: mode,
          reply_to_message_id: target.id,
          draft_text: body,
          subject_proposed: draft.subject_proposed,
          language_detected: draft.language_detected,
          confidence,
          fact_warnings: factWarnings,
        };
        await db.collection("message_drafts").doc(messageId).set({
          ...out,
          message_id: messageId,
          thread_id: threadId || null,
          model: MODEL_SONNET,
          assistant_prefs: {tone: prefs.tone || null, concision: prefs.concision || null, language: prefs.language || null},
          generated_at: admin.firestore.FieldValue.serverTimestamp(),
          generated_by_uid: principal.uid,
          feedback: null,
        }, {merge: true});

        logger.info("generateReplyDraft: ok", {
          messageId, mode, durationMs: Date.now() - started, factWarnings: factWarnings.length,
          by: maskEmail(principal.email),
        });
        return res.status(200).json(out);
      } catch (err) {
        logger.error("generateReplyDraft: échec", {error: err.message});
        const pub = publicAiError(err);
        return res.status(pub.status).json({error: pub.error});
      }
    },
);

exports.buildReplyUser = buildReplyUser;
exports.tidyDraft = tidyDraft;
