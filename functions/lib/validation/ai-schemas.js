/**
 * Schémas de validation des SORTIES IA (zod) — repris de Trendl (Sprint 61).
 *
 * Toute sortie IA est validée AVANT d'être consommée ou écrite (interface
 * `generateStructured`, lib/ai-provider.js). KHentik : seuls les schémas du
 * périmètre e-mails sont conservés (les schémas CRM, prospection, médias,
 * factures… sont retirés) ; les schémas d'analyse et de synthèse sont
 * génériques (aucune catégorie métier propre à Trendl).
 */

const {z} = require("zod");

// Analyse générique d'un e-mail entrant (analyze/analyzeEmail.js).
const emailAnalysisOutputSchema = z.object({
  category: z.enum(["action", "info", "newsletter", "spam", "personal"]),
  senderName: z.string().nullable(),
  senderCompany: z.string().nullable(),
  summary1Line: z.string().min(1).max(400),
  expectedAction: z.string().max(200).nullable(),
  language: z.enum(["fr", "en", "other"]),
});

// Brouillon de réponse (ai/generateReplyDraft.js) — même forme que Trendl.
const replyDraftOutputSchema = z.object({
  subject_proposed: z.string(),
  body: z.string(),
  language_detected: z.enum(["fr", "en", "other"]),
  confidence: z.number().min(0).max(1),
});

// Résumé d'un fil (ai/summarizeThread.js).
const threadSummaryOutputSchema = z.object({
  summary: z.string().min(1).max(1200),
  keyPoints: z.array(z.string().max(300)).max(6),
  status: z.string().max(300),
});

// Résumé 12 h (ai/summarizeRecentEmails.js) — classification générique.
const summarizeEmailsOutputSchema = z.object({
  summary_text: z.string(),
  items: z.array(
      z.object({
        id: z.string(),
        classification: z.enum(["a_traiter", "information", "spam"]),
        score: z.number().int().min(1).max(5),
      }),
  ),
});

// Réponse finale de l'assistant (assistants/assistantChat.js).
const assistantAnswerOutputSchema = z.object({
  answer: z.string().min(1).max(4000),
});

/**
 * Valide une sortie IA (`tool_use.input`) contre son schéma. En cas d'échec,
 * lève une erreur 502 (faute du modèle, pas du client) qui EMPÊCHE l'usage de
 * la donnée. Distincte de validateWrite (entités métier) pour des logs clairs.
 *
 * @param {import("zod").ZodTypeAny} schema
 * @param {unknown} input `tool_use.input` renvoyé par le modèle.
 * @param {string} label Nom de l'étape (ex. "analyzeEmail.parse").
 * @return {object} sortie IA validée.
 * @throws {Error} err.status = 502, err.code = "validation/ai-output".
 */
function validateAiOutput(schema, input, label) {
  const result = schema.safeParse(input);
  if (!result.success) {
    const parts = result.error.issues.map((i) => {
      const path = i.path.length ? i.path.join(".") : "(racine)";
      return `${path} (${i.message})`;
    });
    const err = new Error(
      `Sortie IA invalide [${label}] : ${parts.join(" ; ")}`,
    );
    err.status = 502;
    err.code = "validation/ai-output";
    err.issues = result.error.issues;
    throw err;
  }
  return result.data;
}

module.exports = {
  emailAnalysisOutputSchema,
  replyDraftOutputSchema,
  threadSummaryOutputSchema,
  summarizeEmailsOutputSchema,
  assistantAnswerOutputSchema,
  validateAiOutput,
};
