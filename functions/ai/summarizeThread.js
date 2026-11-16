/**
 * summarizeThread — résumé IA d'un FIL d'e-mails (en-tête de l'espace de
 * traitement : « Résumé de la discussion »).
 *
 * Trendl réutilisait le résumé déjà calculé sur l'opportunité ou la
 * collaboration CRM (thread_summary). Le package n'a pas de CRM : le résumé
 * est calculé sur le fil lui-même, puis mis en cache dans
 * thread_summaries/{threadId}, invalidé dès qu'un message arrive dans le fil
 * (clé = nombre de messages + horodatage du dernier).
 *
 * Body : {threadId}. Réponse : {summary, keyPoints, status, cached}.
 */
const {onRequest} = require("firebase-functions/v2/https");
const {logger} = require("firebase-functions");
const {db, admin} = require("../lib/firebase-admin");
const {requireRole} = require("../lib/admin-auth");
const {ALLOWED_ORIGINS} = require("../lib/cors");
const {getAnthropicClient, MODEL_HAIKU} = require("../lib/anthropic-client");
const {generateStructured} = require("../lib/ai-provider");
const {threadSummaryOutputSchema} = require("../lib/validation/ai-schemas");
const {readThreadMessages, sortThreadChronological, toMillis} = require("../lib/thread-reader");
const {messageDirection} = require("../lib/message-direction");
const {publicAiError} = require("../lib/text-safe");
const {SYSTEM_THREAD, TOOL_THREAD, buildThreadUser} = require("../lib/prompts-generic");

/** Clé de fraîcheur du cache. Pur. */
function threadVersion(ordered) {
  const last = ordered[ordered.length - 1];
  return `${ordered.length}:${last ? toMillis(last.receivedAt) || 0 : 0}`;
}

exports.summarizeThread = onRequest(
    {region: "europe-west1", secrets: ["ANTHROPIC_API_KEY"], cors: ALLOWED_ORIGINS, timeoutSeconds: 60, invoker: "public"},
    async (req, res) => {
      if (req.method !== "POST") return res.status(405).json({error: "Method not allowed"});
      try {
        await requireRole(req);
      } catch (authErr) {
        return res.status(authErr.status || 401).json({error: authErr.message});
      }
      try {
        const threadId = String(req.body?.threadId || "").trim();
        if (!threadId) return res.status(400).json({error: "threadId requis."});
        let ordered = sortThreadChronological(await readThreadMessages(db, threadId, 40));
        if (!ordered.length) {
          // Mail sans threadId Gmail : la clé de fil est l'id du message.
          const one = await db.collection("messages").doc(threadId).get();
          if (one.exists) ordered = [{id: one.id, ...one.data()}];
        }
        if (!ordered.length) return res.status(404).json({error: "Conversation introuvable."});
        const version = threadVersion(ordered);
        const cacheRef = db.collection("thread_summaries").doc(threadId);
        const cached = await cacheRef.get();
        if (cached.exists && cached.get("version") === version) {
          const c = cached.data();
          return res.status(200).json({summary: c.summary, keyPoints: c.keyPoints || [], status: c.status || "", cached: true});
        }
        const client = await getAnthropicClient();
        const out = await generateStructured(client, {
          model: MODEL_HAIKU,
          system: SYSTEM_THREAD,
          user: buildThreadUser(ordered.slice(-15).map((m) => ({
            ...m,
            direction: messageDirection(m.labels),
            receivedAtIso: toMillis(m.receivedAt) ? new Date(toMillis(m.receivedAt)).toISOString().slice(0, 16) : "",
          }))),
          tool: TOOL_THREAD,
          schema: threadSummaryOutputSchema,
          maxTokens: 800,
          label: "summarizeThread",
        });
        await cacheRef.set({...out, version, model: MODEL_HAIKU, updated_at: admin.firestore.FieldValue.serverTimestamp()});
        return res.status(200).json({...out, cached: false});
      } catch (err) {
        logger.error("summarizeThread: échec", {error: err.message});
        const pub = publicAiError(err);
        return res.status(pub.status).json({error: pub.error});
      }
    },
);

exports.threadVersion = threadVersion;
