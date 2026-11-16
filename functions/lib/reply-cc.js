/**
 * Copie (Cc) d'une réponse — Sprint 98 (#9, Mickaël 16/10 : « il faut
 * rajouter la personne en copie d'email aux réponses »).
 *
 * Comme « Répondre à tous » : les personnes en À et en Cc du mail auquel on
 * répond sont reprises en copie, SAUF le destinataire principal et
 * l'entreprise elle-même (domaines du paramètre INTERNAL_DOMAINS + toute
 * adresse qui a ENVOYÉ un mail sortant du fil). Repris de Trendl (où le
 * domaine interne était trendl.agency, codé en dur). Le champ reste modifiable avant l'envoi. PUR.
 */

const {messageDirection} = require("./message-direction");

/** Domaines internes (paramètre INTERNAL_DOMAINS), lus à chaque appel. */
function internalDomains(env = process.env) {
  return String(env.INTERNAL_DOMAINS || "").split(",").map((d) => d.trim().toLowerCase()).filter(Boolean);
}
const EMAIL_RE = /[a-z0-9._%+'-]+@[a-z0-9.-]+\.[a-z]{2,}/gi;
const MAX_CC = 10;

/** Adresses (minuscules) trouvées dans un champ d'en-tête, chaîne ou tableau. */
function addressesOf(value) {
  const raw = Array.isArray(value) ? value.join(", ") : String(value || "");
  return (raw.match(EMAIL_RE) || []).map((a) => a.toLowerCase());
}

/**
 * @param {object} target le mail auquel on répond
 * @param {string} recipient destinataire principal choisi
 * @param {object[]} [thread] tout le fil (pour reconnaître les adresses Trendl)
 * @return {string} adresses séparées par « , » ('' si personne)
 */
function suggestReplyCc(target, recipient, thread = []) {
  if (!target) return "";
  const internal = new Set();
  for (const m of Array.isArray(thread) ? thread : []) {
    if (m && messageDirection(m.labels) === "outbound") addressesOf(m.from).forEach((a) => internal.add(a));
  }
  const exclude = new Set([...addressesOf(recipient), ...internal]);
  // Mail entrant : son expéditeur est le destinataire naturel, jamais en copie.
  if (messageDirection(target.labels) === "inbound") addressesOf(target.from).forEach((a) => exclude.add(a));
  const INTERNAL_DOMAINS = internalDomains();
  const out = [];
  for (const a of [...addressesOf(target.to), ...addressesOf(target.cc)]) {
    const domain = a.split("@")[1] || "";
    if (exclude.has(a) || INTERNAL_DOMAINS.includes(domain) || out.includes(a)) continue;
    out.push(a);
  }
  return out.slice(0, MAX_CC).join(", ");
}

module.exports = {suggestReplyCc, addressesOf};
