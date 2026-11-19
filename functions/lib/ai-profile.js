/**
 * Profil IA de l'instance : style d'écriture et contexte métier du client,
 * issus du questionnaire v2 (voir src/config/instance.mjs).
 *
 * Le fichier functions/config/ai-profile.json est écrit par
 * `npm run config:apply` et déployé AVEC les fonctions : il ne transite
 * jamais par le navigateur. Absent → profil vide (consignes génériques).
 * Les blocs de consignes sont construits par des fonctions PURES (testables).
 */

const EMPTY_PROFILE = Object.freeze({
  profileVersion: 1,
  companyName: "",
  website: "",
  assistant: {},
  context: {},
  referenceTexts: [],
});

let cached = null;

/** Profil installé (lu une fois par instance de fonction). */
function loadAiProfile() {
  if (cached) return cached;
  try {
    // eslint-disable-next-line global-require
    cached = {...EMPTY_PROFILE, ...require("../config/ai-profile.json")};
  } catch (err) {
    cached = EMPTY_PROFILE;
  }
  return cached;
}

const FORMALITY = {
  vous: "Vouvoie toujours le correspondant.",
  tu: "Tutoie toujours le correspondant.",
  adapt: "Adapte le vouvoiement ou le tutoiement au correspondant : vouvoie par défaut, et tutoie si la conversation montre qu'il tutoie ou qu'il s'agit d'un proche ou d'un partenaire habituel.",
};
const GREETING = {
  contextual: "Adapte la formule d'ouverture au contexte et à la relation.",
  formal: "Ouvre toujours par une formule de politesse formelle.",
  brief: "Ouvre par une salutation courte (« Bonjour Prénom, »).",
};
const EMPATHY = {
  neutral: "Reste factuel : pas d'effusion.",
  balanced: "Montre de la considération sans en faire trop.",
  warm: "Sois chaleureux et attentionné.",
};
const CLARIFY = {
  ask: "S'il manque une information pour répondre, pose la question au correspondant ou laisse un espace réservé entre crochets ; ne devine pas.",
  draft: "S'il manque une information, propose une formulation prudente qui n'engage à rien, ou un espace réservé entre crochets.",
};

function line(label, value) {
  const v = String(value || "").trim();
  return v ? `${label} :\n${v}` : "";
}

/** Qui est le client et ce qu'il attend : utile à toutes les consignes. */
function buildContextBlock(profile = loadAiProfile()) {
  const c = profile.context || {};
  const parts = [
    profile.companyName ? `Entreprise : ${profile.companyName}${profile.website ? ` (${profile.website})` : ""}.` : "",
    line("Activité", [c.activity, c.businessDescription].filter(Boolean).join("\n")),
    line("Interlocuteurs habituels", c.audience),
    c.emailTypes && c.emailTypes.length ? `Types d'e-mails habituels : ${c.emailTypes.join(", ")}.` : "",
    line("Vocabulaire métier", c.vocabulary),
  ].filter(Boolean);
  return parts.length ? `CONTEXTE DU CLIENT\n${parts.join("\n")}` : "";
}

/** Règles de priorité du client (analyse des e-mails entrants). */
function buildPriorityBlock(profile = loadAiProfile()) {
  const c = profile.context || {};
  const parts = [
    line("Messages prioritaires", c.priorityExpectations),
    line("Règles de priorité", c.priorityRules),
    line("Situations qui demandent une attention humaine", c.escalationRules),
    c.importantSenders && c.importantSenders.length ? `Expéditeurs importants : ${c.importantSenders.join(", ")}.` : "",
    c.priorityKeywords && c.priorityKeywords.length ? `Mots-clés prioritaires : ${c.priorityKeywords.join(", ")}.` : "",
  ].filter(Boolean);
  return parts.length ? `PRIORITÉS DU CLIENT\n${parts.join("\n")}` : "";
}

/** Style d'écriture du client (brouillons de réponse). */
function buildWritingBlock(profile = loadAiProfile()) {
  const s = profile.assistant || {};
  const parts = [
    FORMALITY[s.formality] || "",
    GREETING[s.greeting] || "",
    EMPATHY[s.empathy] || "",
    CLARIFY[s.clarify] || "",
    s.avoidPromises ? "N'annonce aucun engagement non confirmé dans la conversation (prix, délai, remboursement, geste commercial)." : "",
    line("Consignes de rédaction du client", s.instructions),
    line("Expressions et tournures interdites", s.forbiddenTerms),
    s.signatureText ? `Signature à utiliser (applique la consigne qu'elle contient s'il y en a une, et reprends le reste tel quel) :\n${s.signatureText}` : "",
    s.exampleResponse ? `Exemple de réponse représentative du style du client (pour le ton et la mise en forme ; n'en reprends pas les faits) :\n«««\n${s.exampleResponse}\n»»»` : "",
    ...(profile.referenceTexts || []).map((r) => `Guide d'écriture fourni par le client (${r.fileName}) :\n«««\n${r.text}\n»»»`),
  ].filter(Boolean);
  return parts.length ? `STYLE D'ÉCRITURE DU CLIENT (prioritaire sur les règles de style générales)\n${parts.join("\n")}` : "";
}

/** Préférences de ton : le profil serveur prime sur celles envoyées par l'application. */
function assistantPrefs(prefs = {}, profile = loadAiProfile()) {
  const s = profile.assistant || {};
  return {
    ...prefs,
    ...Object.fromEntries(["name", "tone", "concision", "language"].filter((k) => s[k]).map((k) => [k, s[k]])),
  };
}

function resetAiProfileCache() {
  cached = null;
}

module.exports = {
  EMPTY_PROFILE,
  loadAiProfile,
  buildContextBlock,
  buildPriorityBlock,
  buildWritingBlock,
  assistantPrefs,
  resetAiProfileCache,
};
