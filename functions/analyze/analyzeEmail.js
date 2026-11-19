/**
 * analyzeEmail — analyse IA générique de chaque e-mail entrant.
 *
 * Déclencheur, idempotence, verrou « processing », limitation de la
 * concurrence et écriture du statut d'échec : repris de la fonction Trendl
 * du même nom (Sprint 12 → 95).
 *
 * Changé : une seule étape générique (lib/prompts-generic.js) produisant
 * catégorie (action / info / newsletter / spam / personal), nom et entreprise
 * de l'expéditeur (seulement si présents dans l'e-mail), résumé en une phrase
 * et action attendue. Retirés : classification « commercial » propre à une
 * agence d'influence, extraction de marques/créateurs/agences/montants et
 * rapprochement avec le CRM (crm-matcher), qualification d'opportunités.
 *
 * Ne consomme pas d'IA pour : messages sortants, messages déjà en spam
 * (Gmail ou domaine bloqué), brouillons.
 */
const {onDocumentWritten} = require("firebase-functions/v2/firestore");
const {logger} = require("firebase-functions");
const {db, admin} = require("../lib/firebase-admin");
const {getAnthropicClient, MODEL_HAIKU} = require("../lib/anthropic-client");
const {generateStructured} = require("../lib/ai-provider");
const {emailAnalysisOutputSchema} = require("../lib/validation/ai-schemas");
const {messageDirection, isDraftMessage} = require("../lib/message-direction");
const {buildAnalyzeSystem, TOOL_ANALYZE, buildAnalyzeUser} = require("../lib/prompts-generic");

// v2 : contexte et priorités du client (questionnaire v2), champ « urgent ».
const MODEL_VERSION = "khentik-generic-v2";

/** Faut-il analyser ce message ? Pur (exporté pour les tests). */
function analysisDecision(m) {
  if (!m) return "skip:deleted";
  const labels = Array.isArray(m.labels) ? m.labels : [];
  if (isDraftMessage(labels)) return "skip:draft";
  if (messageDirection(labels) === "outbound") return "skip:outbound";
  if (m.analysis && m.analysis.modelVersion === MODEL_VERSION &&
    ["completed", "processing"].includes(m.analysis.status)) return "skip:done";
  if (m.spam_filtered || labels.includes("SPAM")) return "spam";
  return "analyze";
}

exports.analyzeEmail = onDocumentWritten(
    {document: "messages/{messageId}", region: "europe-west1", secrets: ["ANTHROPIC_API_KEY"], timeoutSeconds: 120, maxInstances: 8},
    async (event) => {
      const messageId = event.params.messageId;
      const after = event.data && event.data.after;
      const m = after && after.exists ? after.data() : null;
      const decision = analysisDecision(m);
      if (decision.startsWith("skip")) return;
      const ref = db.collection("messages").doc(messageId);
      if (decision === "spam") {
        await ref.set({analysis: {
          status: "completed", modelVersion: MODEL_VERSION, category: "spam",
          summary1Line: "Message classé en spam.", expectedAction: null, senderName: null, senderCompany: null,
          completedAt: admin.firestore.FieldValue.serverTimestamp(),
        }}, {merge: true});
        return;
      }
      try {
        await ref.set({analysis: {status: "processing", modelVersion: MODEL_VERSION, startedAt: admin.firestore.FieldValue.serverTimestamp()}}, {merge: true});
        const client = await getAnthropicClient();
        const out = await generateStructured(client, {
          model: MODEL_HAIKU,
          system: buildAnalyzeSystem(),
          user: buildAnalyzeUser(m),
          tool: TOOL_ANALYZE,
          schema: emailAnalysisOutputSchema,
          maxTokens: 600,
          label: "analyzeEmail",
        });
        await ref.set({analysis: {
          ...out,
          status: "completed",
          modelVersion: MODEL_VERSION,
          model: MODEL_HAIKU,
          completedAt: admin.firestore.FieldValue.serverTimestamp(),
        }}, {merge: true});
      } catch (err) {
        logger.error("analyzeEmail: échec", {messageId, error: err.message});
        await ref.set({analysis: {status: "failed", modelVersion: MODEL_VERSION, error: String(err.message || "").slice(0, 300)}}, {merge: true})
            .catch(() => {});
      }
    },
);

exports.analysisDecision = analysisDecision;
exports.MODEL_VERSION = MODEL_VERSION;
