/**
 * Réglages de l'assistant — partie PURE, partagée par l'application (liste
 * « À traiter », écran Réglages) et par les fonctions serveur (validation
 * avant écriture, test de parité). Aucun import : utilisable partout.
 *
 * Repris de Trendl (« Priorités d'Alfred », réglages de réponse) pour le seul
 * périmètre e-mails : ni montant, ni marque, ni historique de collaboration.
 * Principe conservé : AUCUNE RÈGLE CACHÉE. Tout ce qui entre dans le score est
 * ici, visible et modifiable par l'utilisatrice.
 */

/** Niveaux d'un expéditeur (personne, entreprise ou domaine). */
export const SENDER_LEVELS = Object.freeze([
  { key: 'strategic', label: 'Stratégique' },
  { key: 'important', label: 'Important' },
  { key: 'low', label: 'Bas de liste' },
]);

export const CATEGORY_LABELS = Object.freeze({
  action: 'Action attendue',
  info: 'Information',
  newsletter: 'Newsletters',
  spam: 'Spam',
  personal: 'Personnel',
});

/** Barème par défaut (repris de Trendl, questionnaire S106). */
export const DEFAULT_PRIORITIES = Object.freeze({
  familyWeights: { reply: 100, todo: 20 },
  fresh: { d0: 30, d1: 26, d2: 22, d3: 18, d4to7: 10, d8to14: 0, d15to21: -15, d22plus: -35 },
  expectedActionBonus: 15,
  urgentBonus: 20,
  levelWeights: { strategic: 30, important: 15, low: -25 },
  senders: [],
  keywords: [],
  keywordBonus: 10,
  excludedCategories: ['newsletter', 'spam'],
  agePerDay: 2,
  ageMax: 20,
  maxItems: 12,
  aiRules: '',
});

export const FRESH_LABELS = Object.freeze({
  d0: 'Reçu aujourd’hui',
  d1: 'Hier',
  d2: 'Il y a 2 jours',
  d3: 'Il y a 3 jours',
  d4to7: '4 à 7 jours',
  d8to14: '8 à 14 jours',
  d15to21: '15 à 21 jours',
  d22plus: 'Plus de 21 jours',
});

export const LIMITS = Object.freeze({ points: 200, senders: 100, keywords: 50, text: 4000, word: 60, maxItems: 30 });

const num = (v, d, min = -LIMITS.points, max = LIMITS.points) => {
  const n = Number(v);
  return Number.isFinite(n) ? Math.min(max, Math.max(min, Math.round(n))) : d;
};
const str = (v, max) => (typeof v === 'string' ? v.trim().slice(0, max) : '');

/**
 * Réglages de priorité complets et sûrs, quels que soient les réglages
 * enregistrés (anciens, partiels ou abîmés). `fallback` : valeurs de départ
 * propres à l'instance (expéditeurs importants et consignes du questionnaire).
 */
export function normalizePriorities(raw = {}, fallback = {}) {
  const d = { ...DEFAULT_PRIORITIES, ...fallback };
  const r = raw && typeof raw === 'object' ? raw : {};
  const senders = (Array.isArray(r.senders) ? r.senders : d.senders)
    .map((s) => ({ match: str(s?.match, LIMITS.word).toLowerCase(), level: SENDER_LEVELS.some((l) => l.key === s?.level) ? s.level : 'important' }))
    .filter((s) => s.match.length >= 3)
    .slice(0, LIMITS.senders);
  const keywords = (Array.isArray(r.keywords) ? r.keywords : d.keywords)
    .map((k) => str(k, LIMITS.word).toLowerCase())
    .filter((k) => k.length >= 3)
    .slice(0, LIMITS.keywords);
  return {
    familyWeights: {
      reply: num(r.familyWeights?.reply, d.familyWeights.reply),
      todo: num(r.familyWeights?.todo, d.familyWeights.todo),
    },
    fresh: Object.fromEntries(Object.entries(DEFAULT_PRIORITIES.fresh).map(([k, v]) => [k, num(r.fresh?.[k], d.fresh?.[k] ?? v)])),
    expectedActionBonus: num(r.expectedActionBonus, d.expectedActionBonus),
    urgentBonus: num(r.urgentBonus, d.urgentBonus),
    levelWeights: Object.fromEntries(SENDER_LEVELS.map(({ key }) => [key, num(r.levelWeights?.[key], d.levelWeights[key])])),
    senders,
    keywords,
    keywordBonus: num(r.keywordBonus, d.keywordBonus),
    excludedCategories: (Array.isArray(r.excludedCategories) ? r.excludedCategories : d.excludedCategories).filter((c) => CATEGORY_LABELS[c]),
    agePerDay: num(r.agePerDay, d.agePerDay, 0, 50),
    ageMax: num(r.ageMax, d.ageMax, 0, LIMITS.points),
    maxItems: num(r.maxItems, d.maxItems, 3, LIMITS.maxItems),
    aiRules: typeof r.aiRules === 'string' ? str(r.aiRules, LIMITS.text) : str(d.aiRules, LIMITS.text),
  };
}

/** Réglages de réponse : ce qui guide les brouillons d'Alice. */
export const REPLY_OPTIONS = Object.freeze({
  tone: { cordial: 'Cordial', professional: 'Professionnel', direct: 'Direct' },
  concision: { short: 'Courte', balanced: 'Équilibrée', detailed: 'Détaillée' },
  language: { fr: 'Français', en: 'Anglais' },
  formality: { vous: 'Vouvoiement', tu: 'Tutoiement', adapt: 'Selon le correspondant' },
});

export const DEFAULT_REPLIES = Object.freeze({
  tone: 'cordial',
  concision: 'balanced',
  language: 'fr',
  formality: 'vous',
  signatureText: '',
  instructions: '',
  forbiddenTerms: '',
});

export function normalizeReplies(raw = {}, fallback = {}) {
  const d = { ...DEFAULT_REPLIES, ...fallback };
  const r = raw && typeof raw === 'object' ? raw : {};
  const pick = (key) => (REPLY_OPTIONS[key][r[key]] ? r[key] : REPLY_OPTIONS[key][d[key]] ? d[key] : DEFAULT_REPLIES[key]);
  const text = (key) => (typeof r[key] === 'string' ? str(r[key], LIMITS.text) : str(d[key], LIMITS.text));
  return {
    tone: pick('tone'),
    concision: pick('concision'),
    language: pick('language'),
    formality: pick('formality'),
    signatureText: text('signatureText'),
    instructions: text('instructions'),
    forbiddenTerms: text('forbiddenTerms'),
  };
}
