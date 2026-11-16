/**
 * spam-domains.js — domaines d'expéditeurs envoyés directement en spam.
 *
 * Extrait de lib/email-qualification.js (Trendl, Sprint 95/106) SANS la
 * qualification automatique d'opportunités (CRM), qui est retirée.
 * Réglage : document Firestore app_settings/spam_v1, champ `spam_domains`
 * (ex. ["exemple-spam.com", ".xyz"]). Une entrée commençant par « . »
 * bloque tout un suffixe (ex. « .xyz »).
 */
const SETTINGS_COLLECTION = "app_settings";
const SETTINGS_DOC_ID = "spam_v1";

function parseEmailAddress(from) {
  if (typeof from !== "string") return "";
  const angled = from.match(/<([^<>\s]+@[^<>\s]+)>/);
  const raw = angled ? angled[1] : (from.match(/[^\s"'<>]+@[^\s"'<>]+/) || [""])[0];
  return raw.toLowerCase().replace(/[;,]+$/, "");
}

function domainOf(address) {
  const at = typeof address === "string" ? address.lastIndexOf("@") : -1;
  return at > 0 ? address.slice(at + 1).toLowerCase() : "";
}

function normalizeDomainList(list) {
  if (!Array.isArray(list)) return [];
  return list
      .map((d) => String(d || "").trim().toLowerCase().replace(/^@/, "").replace(/^\*\./, "."))
      .filter(Boolean);
}

/** Domaine bloqué correspondant à l'expéditeur, ou "". Pur. */
function spamDomainOf(from, settings) {
  const domain = domainOf(parseEmailAddress(from));
  if (!domain) return "";
  const list = normalizeDomainList(settings && settings.spam_domains);
  return list.find((d) => (d.startsWith(".") ? domain.endsWith(d) : domain === d || domain.endsWith(`.${d}`))) || "";
}

async function readSpamSettings(db) {
  const snap = await db.collection(SETTINGS_COLLECTION).doc(SETTINGS_DOC_ID).get();
  return {spam_domains: normalizeDomainList(snap.exists ? snap.data().spam_domains : [])};
}

module.exports = {parseEmailAddress, domainOf, normalizeDomainList, spamDomainOf, readSpamSettings};
