/**
 * Réponse de l'assistant conversationnel : courte et actionnable.
 *
 * L'IA rend {resume, actions[]} par l'outil final « repondre ». Ici on
 * valide (zod, DATA-6), on retire toute mise en forme (astérisques, titres,
 * émojis) et on ne garde que les thread_id que les outils ont réellement
 * renvoyés (pas de lien inventé). Fonctions PURES, testées.
 *
 * Même nettoyage côté écran : src/shared/utils/plain-text.js (test de parité).
 */
const {z} = require("zod");

const MAX_ACTIONS = 5;
const KINDS = ["repondre", "ouvrir", "tache"];

/** Texte brut : sans markdown ni émojis, espaces propres. */
function plainText(s) {
  return String(s ?? "")
      .replace(/```[a-z]*\n?/gi, "")
      .replace(/`([^`]*)`/g, "$1")
      .replace(/\*\*([^*]+)\*\*/g, "$1")
      .replace(/__([^_]+)__/g, "$1")
      .replace(/^\s{0,3}#{1,6}\s+/gm, "")
      .replace(/^\s*[*-]\s+/gm, "• ")
      .replace(/\*{1,3}|_{2,3}/g, "")
      .replace(/\p{Extended_Pictographic}️?/gu, "")
      .replace(/[ \t]+/g, " ")
      .replace(/ *\n */g, "\n")
      .replace(/\n{3,}/g, "\n\n")
      .trim();
}

const actionSchema = z.object({
  titre: z.string().min(1),
  thread_id: z.string().max(200).optional().nullable(),
  echeance: z.string().max(60).optional().nullable(),
  type: z.string().optional().nullable(),
});
const answerSchema = z.object({
  resume: z.string().optional().nullable(),
  answer: z.string().optional().nullable(),
  actions: z.array(z.unknown()).optional().nullable(),
});

/**
 * @param {unknown} final  entrée de l'outil « repondre »
 * @param {{knownThreads?: Set<string>, fallbackText?: string}} [opts]
 * @returns {{text: string, actions: {title: string, threadId: string|null, due: string|null, kind: string}[]}}
 */
function normalizeAnswer(final, {knownThreads = new Set(), fallbackText = ""} = {}) {
  const parsed = answerSchema.safeParse(final && typeof final === "object" ? final : {});
  const raw = parsed.success ? parsed.data : {};
  const text = plainText(raw.resume || raw.answer || fallbackText).slice(0, 600) || "Rien à signaler.";
  const actions = [];
  for (const item of raw.actions || []) {
    const a = actionSchema.safeParse(item);
    if (!a.success) continue;
    const title = plainText(a.data.titre).replace(/\n+/g, " ").slice(0, 140);
    if (!title) continue;
    const threadId = a.data.thread_id && knownThreads.has(a.data.thread_id) ? a.data.thread_id : null;
    let kind = KINDS.includes(a.data.type) ? a.data.type : "tache";
    if (!threadId && kind !== "tache") kind = "tache";
    const due = a.data.echeance ? plainText(a.data.echeance).slice(0, 40) || null : null;
    actions.push({title, threadId, due, kind});
    if (actions.length >= MAX_ACTIONS) break;
  }
  return {text, actions};
}

/** Version texte (historique de conversation envoyé à l'IA au tour suivant). */
function answerAsText({text, actions}) {
  return [text, ...actions.map((a, i) => `${i + 1}. ${a.title}${a.due ? ` (${a.due})` : ""}${a.threadId ? ` [fil ${a.threadId}]` : ""}`)].join("\n");
}

/** Relève les thread_id présents dans un résultat d'outil. */
function collectThreadIds(result, into) {
  if (!result || typeof result !== "object") return into;
  if (typeof result.thread_id === "string") into.add(result.thread_id);
  for (const f of Array.isArray(result.fils) ? result.fils : []) if (typeof f?.thread_id === "string") into.add(f.thread_id);
  return into;
}

module.exports = {plainText, normalizeAnswer, answerAsText, collectThreadIds, MAX_ACTIONS};
