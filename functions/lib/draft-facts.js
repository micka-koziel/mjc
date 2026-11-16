/**
 * Contrôle « zéro invention » des brouillons IA — Sprint 103 (posts 6 et 8
 * de l'équipe Trendl, 22/10).
 *
 *  - post 6 : l'IA a inventé une adresse de livraison (« Trendl Agency,
 *    4 rue de Clichy, 75009 Paris », téléphone « +33 6 XX XX XX XX ») ;
 *  - post 8 : elle a fabriqué les liens Instagram / TikTok / YouTube de
 *    Monsieur GRrr (avec 4 r au lieu de 3).
 *
 * Le prompt donne désormais les vraies données (liens des fiches, adresses
 * de livraison) et interdit d'en écrire d'autres. Ce module vérifie APRÈS
 * coup : tout lien, téléphone ou adresse postale du brouillon qui n'apparaît
 * ni dans les données fournies ni dans le fil est signalé « non vérifié »
 * (surligné dans l'éditeur, confiance abaissée). Un espace réservé oublié
 * (« XX XX », « [À COMPLÉTER] »…) bloque l'envoi.
 *
 * Module PUR.
 */

const URL_RE = /\bhttps?:\/\/[^\s<>"')\]]+|\bwww\.[^\s<>"')\]]+/gi;
// Téléphones : +33 6 12 34 56 78, 06.12.34.56.78, +1 (555) 123-4567…
const PHONE_RE = /(?:\+\d{1,3}[\s.-]?)?(?:\(?\d{1,4}\)?[\s.-]?){3,6}\d{2,4}/g;
const STREET_RE = /\b\d{1,4}(?:\s?(?:bis|ter))?,?\s+(?:rue|avenue|av\.|boulevard|bd|allée|allee|place|chemin|impasse|quai|route|cours|square|street|st\.|road|rd\.|avenue)\b[^\n,]{2,60}/gi;
const PLACEHOLDER_RE = /\[[^\]\n]{0,40}(?:compl[ée]ter|to complete|à préciser|a preciser|adresse|address|lien|link|t[ée]l[ée]phone|phone|xxx)[^\]\n]{0,40}\]|\b(?:XX[\s.]?){2,}X*\b|\?{3,}|\bTODO\b|\bTBD\b/gi;

/**
 * Lien comparable : sans protocole, « www. », barre finale ni ponctuation
 * finale, en minuscules.
 * @param {string} url
 * @return {string}
 */
function normalizeUrl(url) {
  return String(url || "")
      .trim()
      .replace(/[.,;:!?)\]]+$/, "")
      .replace(/^https?:\/\//i, "")
      .replace(/^www\./i, "")
      .replace(/\/+$/, "")
      .toLowerCase();
}

/**
 * Chiffres seuls d'un numéro (« +33 6 12… » et « 06 12… » se comparent sur
 * les 9 derniers chiffres).
 * @param {string} phone
 * @return {string}
 */
function phoneKey(phone) {
  const digits = String(phone || "").replace(/\D/g, "");
  return digits.length >= 9 ? digits.slice(-9) : "";
}

/**
 * Texte comparable (minuscules, sans accents ni espaces multiples).
 * @param {string} s
 * @return {string}
 */
function textKey(s) {
  return String(s || "").toLowerCase().normalize("NFD")
      .replace(/[̀-ͯ]/g, "").replace(/\s+/g, " ").trim();
}

/**
 * Liens d'un texte.
 * @param {string} text
 * @return {string[]}
 */
function extractUrls(text) {
  return [...new Set((String(text || "").match(URL_RE) || []).map((u) => u.replace(/[.,;:!?)\]]+$/, "")))];
}

/**
 * Numéros de téléphone d'un texte (au moins 9 chiffres).
 * @param {string} text
 * @return {string[]}
 */
function extractPhones(text) {
  const out = [];
  for (const m of String(text || "").match(PHONE_RE) || []) {
    const v = m.trim();
    if (phoneKey(v) && !out.includes(v)) out.push(v);
  }
  return out;
}

/**
 * Adresses postales (numéro + type de voie) d'un texte.
 * @param {string} text
 * @return {string[]}
 */
function extractStreets(text) {
  return [...new Set((String(text || "").match(STREET_RE) || []).map((s) => s.trim()))];
}

/**
 * Espaces réservés restés dans un texte (« XX XX », « [à compléter] »…).
 * @param {string} text
 * @return {string[]}
 */
function findPlaceholders(text) {
  return [...new Set((String(text || "").match(PLACEHOLDER_RE) || []).map((s) => s.trim()))].slice(0, 5);
}

/**
 * Faits pratiques du brouillon absents des sources fournies.
 * @param {string} draft texte du brouillon
 * @param {{urls?: string[], texts?: string[]}} known liens connus (fiches
 *   créateurs, réglages) + textes sources (fil d'e-mails, blocs du prompt)
 * @return {Array<{kind: "lien"|"téléphone"|"adresse", value: string}>}
 */
function findUnverifiedFacts(draft, known = {}) {
  const sourceText = (known.texts || []).join("\n");
  const sourceKey = textKey(sourceText);
  const knownUrls = new Set([
    ...(known.urls || []).map(normalizeUrl),
    ...extractUrls(sourceText).map(normalizeUrl),
  ].filter(Boolean));
  const knownPhones = new Set(extractPhones(sourceText).map(phoneKey).filter(Boolean));
  const out = [];
  for (const url of extractUrls(draft)) {
    if (!knownUrls.has(normalizeUrl(url))) out.push({kind: "lien", value: url});
  }
  for (const phone of extractPhones(draft)) {
    if (!knownPhones.has(phoneKey(phone))) out.push({kind: "téléphone", value: phone});
  }
  for (const street of extractStreets(draft)) {
    if (!sourceKey.includes(textKey(street))) out.push({kind: "adresse", value: street});
  }
  return out.slice(0, 10);
}

module.exports = {
  normalizeUrl,
  phoneKey,
  extractUrls,
  extractPhones,
  extractStreets,
  findPlaceholders,
  findUnverifiedFacts,
};
