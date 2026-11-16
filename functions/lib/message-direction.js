/**
 * message-direction.js — Sprint 83.
 *
 * Direction d'un message (entrant / sortant) et détection des brouillons,
 * à partir des labels Gmail. PUR (testable sans Firestore ni Gmail).
 *
 * Contexte : l'ingestion récupère TOUT l'historique Gmail (messageAdded sans
 * filtre de label), donc aussi les messages ENVOYÉS par Trendl et les
 * BROUILLONS enregistrés. On s'en sert pour (a) ne pas ingérer les brouillons
 * et (b) tagger chaque message ingéré d'une direction, exploitée en aval
 * (affichage du fil + qualification d'opportunité sur les sortants).
 */

const DRAFT_LABEL = "DRAFT";
const SENT_LABEL = "SENT";
const INBOX_LABEL = "INBOX";

/**
 * Le message est-il un brouillon Gmail ? Pur.
 * @param {string[]|undefined} labels labelIds Gmail
 * @return {boolean}
 */
function isDraftMessage(labels) {
  return Array.isArray(labels) && labels.includes(DRAFT_LABEL);
}

/**
 * Direction d'un message depuis ses labels. Pur.
 * Règle : présence d'INBOX = entrant (prioritaire, ex. mail qu'on se
 * s'envoie à soi) ; sinon présence de SENT = sortant ; défaut = entrant.
 * @param {string[]|undefined} labels labelIds Gmail
 * @return {"inbound"|"outbound"}
 */
function messageDirection(labels) {
  const arr = Array.isArray(labels) ? labels : [];
  if (arr.includes(INBOX_LABEL)) return "inbound";
  if (arr.includes(SENT_LABEL)) return "outbound";
  return "inbound";
}

module.exports = {
  isDraftMessage,
  messageDirection,
  DRAFT_LABEL,
  SENT_LABEL,
  INBOX_LABEL,
};
