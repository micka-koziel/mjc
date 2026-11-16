/**
 * Recherche Mailbox côté Gmail — Sprint 97 (Aurel, 13/10 : « quand je fais une
 * recherche dans la mailbox ça ne me trouve souvent rien »).
 *
 * Cause : l'écran ne cherchait que dans les ~200 derniers mails chargés, et
 * seulement dans l'objet, l'expéditeur et l'extrait du DERNIER message de
 * chaque fil. Un mail plus ancien, ou un mot présent dans le corps, était
 * introuvable. Gmail, lui, sait chercher partout (objet, corps, pièces
 * jointes, toutes dates) : on lui pose la question et on récupère les fils.
 *
 * PUR : nettoyage de la requête et lecture de la réponse Gmail.
 */

const MAX_QUERY_LENGTH = 200;
const MAX_THREADS = 25;

/**
 * Requête Gmail sûre : une ligne, bornée, sans opérateurs de suppression.
 * Les opérateurs Gmail utiles (from:, subject:…) restent permis.
 * @param {string} raw
 * @return {string} chaîne vide si inutilisable
 */
function buildGmailQuery(raw) {
  const q = String(raw || "")
      .replace(/[\r\n\t]+/g, " ")
      .replace(/\s{2,}/g, " ")
      .trim()
      .slice(0, MAX_QUERY_LENGTH);
  if (q.length < 2) return "";
  // Hors corbeille et spam, comme la recherche par défaut de Gmail.
  return `${q} -in:trash -in:spam`;
}

/**
 * Identifiants de fils d'une réponse users.threads.list, dédupliqués.
 * @param {object} data réponse Gmail (data)
 * @return {string[]}
 */
function threadIdsFromGmail(data) {
  const list = (data && Array.isArray(data.threads)) ? data.threads : [];
  const out = [];
  for (const t of list) {
    if (t && typeof t.id === "string" && !out.includes(t.id)) out.push(t.id);
    if (out.length >= MAX_THREADS) break;
  }
  return out;
}

module.exports = {buildGmailQuery, threadIdsFromGmail, MAX_THREADS, MAX_QUERY_LENGTH};
