/**
 * Réglages de l'assistant modifiés par l'utilisatrice (écran Réglages) :
 * priorités (barème, expéditeurs, mots-clés, consignes de priorité) et
 * réponses (ton, longueur, tutoiement, signature, consignes, interdits).
 *
 * Stockés dans app_settings/assistant_priorities et
 * app_settings/assistant_replies (champ `value`), écrits UNIQUEMENT par la
 * fonction assistantSettings après validation (zod). Ils priment sur le
 * profil du questionnaire (functions/config/ai-profile.json).
 *
 * Les limites reprennent src/features/settings/lib/assistant-settings.js
 * (test de parité : lib/assistant-settings.test.js).
 */
const {z} = require("zod");
const {db} = require("./firebase-admin");

const DOCS = {priorities: "assistant_priorities", replies: "assistant_replies"};
const points = z.number().int().min(-200).max(200);
const text = z.string().max(4000);

const prioritiesSchema = z.object({
  familyWeights: z.object({reply: points, todo: points}),
  fresh: z.object({d0: points, d1: points, d2: points, d3: points, d4to7: points, d8to14: points, d15to21: points, d22plus: points}),
  expectedActionBonus: points,
  urgentBonus: points,
  levelWeights: z.object({strategic: points, important: points, low: points}),
  senders: z.array(z.object({match: z.string().min(3).max(60), level: z.enum(["strategic", "important", "low"])})).max(100),
  keywords: z.array(z.string().min(3).max(60)).max(50),
  keywordBonus: points,
  excludedCategories: z.array(z.enum(["action", "info", "newsletter", "spam", "personal"])).max(5),
  agePerDay: z.number().int().min(0).max(50),
  ageMax: z.number().int().min(0).max(200),
  maxItems: z.number().int().min(3).max(30),
  aiRules: text,
}).strict();

const repliesSchema = z.object({
  tone: z.enum(["cordial", "professional", "direct"]),
  concision: z.enum(["short", "balanced", "detailed"]),
  language: z.enum(["fr", "en"]),
  formality: z.enum(["vous", "tu", "adapt"]),
  signatureText: text,
  instructions: text,
  forbiddenTerms: text,
}).strict();

const SCHEMAS = {priorities: prioritiesSchema, replies: repliesSchema};

/** Valide des réglages avant écriture. @return {{ok: true, value: object} | {ok: false, error: string}} */
function validateSettings(kind, value) {
  const schema = SCHEMAS[kind];
  if (!schema) return {ok: false, error: "Type de réglages inconnu."};
  const r = schema.safeParse(value);
  if (r.success) return {ok: true, value: r.data};
  const first = r.error.issues[0];
  return {ok: false, error: `Réglage invalide : ${first.path.join(".") || "(ensemble)"} (${first.message}).`};
}

let cache = {at: 0, value: null};

/** Réglages enregistrés (null si jamais modifiés). Cache d'une minute. */
async function readAssistantSettings({fresh = false} = {}) {
  if (!fresh && cache.value && Date.now() - cache.at < 60 * 1000) return cache.value;
  const [p, r] = await Promise.all(Object.values(DOCS).map((id) => db.collection("app_settings").doc(id).get()));
  const value = {
    priorities: p.exists ? p.get("value") || null : null,
    replies: r.exists ? r.get("value") || null : null,
  };
  cache = {at: Date.now(), value};
  return value;
}

function clearAssistantSettingsCache() {
  cache = {at: 0, value: null};
}

/**
 * Profil effectif : le profil du questionnaire, complété et remplacé par les
 * réglages de l'utilisatrice. Fonction PURE.
 */
function effectiveProfile(profile, settings = {}) {
  const out = {...profile, assistant: {...(profile.assistant || {})}, context: {...(profile.context || {})}};
  const rep = settings.replies;
  if (rep) {
    for (const k of ["tone", "concision", "language", "formality", "signatureText", "instructions", "forbiddenTerms"]) {
      if (rep[k] !== undefined) out.assistant[k] = rep[k];
    }
    if (rep.signatureText !== undefined) out.assistant.signature = rep.signatureText ? "custom" : "none";
  }
  const pri = settings.priorities;
  if (pri) {
    // Les consignes de priorité de l'écran Réglages remplacent celles du questionnaire.
    out.context.priorityRules = pri.aiRules || "";
    out.context.priorityExpectations = "";
    out.context.escalationRules = "";
    out.context.importantSenders = (pri.senders || []).filter((s) => s.level !== "low").map((s) => s.match);
    out.context.priorityKeywords = pri.keywords || [];
  }
  return out;
}

module.exports = {DOCS, validateSettings, readAssistantSettings, clearAssistantSettingsCache, effectiveProfile};
