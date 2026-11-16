/**
 * log-redact.js — Masquage des données personnelles (PII) dans les logs.
 *
 * Sprint 58 (A5) — Sortir les PII des logs des Cloud Functions.
 *
 * Constat d'Alex : des emails, noms et contenus de messages partaient en clair
 * dans Cloud Logging. Les logs servent au debug ops, pas à l'audit : la piste
 * d'audit nominative vit dans la collection Firestore `audit_logs` (accès
 * contrôlé). Cloud Logging ne doit donc contenir que des PII masquées.
 *
 * Règle : aucune adresse email, aucun nom de personne, aucun contenu de mail en
 * clair dans un appel à `logger.*`. On masque au point d'émission via ces
 * helpers purs (testables sans Firebase).
 *
 * Métaphore : on noircit au marqueur les infos nominatives sur une photocopie
 * avant de la classer — on garde la forme (pour debugger), pas l'identité.
 */

// Email « plausible » dans un texte libre (assez tolérant, pas une validation).
const EMAIL_RE = /[\w.+-]+@[\w-]+\.[\w.-]+/gi;

/**
 * Masque une adresse email : "mickael.koziel@gmail.com" -> "m***@gmail.com".
 * Conserve la 1re lettre + le domaine (utile au debug), masque le reste.
 * Les valeurs non-string sont renvoyées telles quelles (null/undefined) ou
 * remplacées par "***" (objets inattendus).
 *
 * @param {*} value
 * @return {*}
 */
function maskEmail(value) {
  if (value === null || value === undefined) return value;
  if (typeof value !== "string") return "***";
  const at = value.indexOf("@");
  if (at < 0) return "***";
  const local = value.slice(0, at);
  const domain = value.slice(at + 1);
  const head = local.slice(0, 1);
  return `${head}***@${domain}`;
}

/**
 * Masque toutes les adresses email trouvées dans un texte libre.
 * @param {*} text
 * @return {*}
 */
function maskEmails(text) {
  if (typeof text !== "string") return text;
  return text.replace(EMAIL_RE, (m) => maskEmail(m));
}

/**
 * Masque chaque email d'une liste. Renvoie la valeur telle quelle si ce n'est
 * pas un tableau.
 * @param {*} list
 * @return {*}
 */
function maskEmailList(list) {
  if (!Array.isArray(list)) return list;
  return list.map((e) => maskEmail(e));
}

/**
 * Masque un nom de personne : "Jean Dupont" -> "J*** D***".
 * Chaque mot est réduit à sa 1re lettre suivie de "***".
 * @param {*} value
 * @return {*}
 */
function maskName(value) {
  if (value === null || value === undefined) return value;
  if (typeof value !== "string") return "***";
  const trimmed = value.trim();
  if (trimmed === "") return "***";
  return trimmed
    .split(/\s+/)
    .map((tok) => `${tok.slice(0, 1)}***`)
    .join(" ");
}

module.exports = {
  maskEmail,
  maskEmails,
  maskEmailList,
  maskName,
};
