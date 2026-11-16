/**
 * reply-target.js — repris tel quel de Trendl (lib/opportunity-reply-target.js, Sprint 87.1).
 * Malgré son nom d’origine, la logique ne dépend pas du CRM : elle ne lit que
 * les messages du fil.
 *
 * Décide, pour le fil d'une opportunité, DE QUOI il s'agit et À QUI on écrit :
 *
 *  - Si le DERNIER message du fil est ENTRANT (le client a écrit en dernier →
 *    la balle est dans le camp de Trendl) → mode `reply` : on RÉPOND au client.
 *  - Si le DERNIER message est SORTANT (Trendl a écrit en dernier → on attend
 *    le client, cas « Airseekers ») → mode `relance` : il n'y a rien à
 *    « répondre », on propose un mail de SUIVI adressé au client.
 *
 * Bug corrigé : l'ancien code prenait toujours le dernier message ENTRANT comme
 * cible, même quand Trendl avait déjà répondu après — l'IA écrivait alors « à
 * la place du client » (ex. « Best regards, Ann ») et le destinataire tombait
 * sur Trendl lui-même (max@trendl.agency).
 *
 * Règle destinataire (garde-fou) : le destinataire est TOUJOURS l'interlocuteur
 * EXTERNE, jamais Trendl. On l'obtient sans connaître les domaines internes,
 * juste via la direction Gmail : l'expéditeur d'un message ENTRANT est le
 * client ; à défaut (démarchage à froid sans réponse), le `to` du message
 * SORTANT est le client.
 *
 * PUR (aucun Firestore) → testable seul (opportunity-reply-target.test.js).
 */

const {messageDirection} = require("./message-direction");

/** Extrait une adresse email d'un header RFC 5322 (« Nom <a@b.co> ») ou d'un tableau. */
function extractEmail(value) {
  if (value === null || value === undefined) return "";
  const raw = Array.isArray(value) ? value[0] || "" : String(value);
  const angle = raw.match(/<([^<>]+@[^<>]+)>/);
  if (angle) return angle[1].trim();
  const bare = raw.match(/[^\s<>"]+@[^\s<>"]+\.[^\s<>"]+/);
  return bare ? bare[0].trim() : raw.trim();
}

/**
 * @param {Array<object>} ordered messages du fil, DU PLUS ANCIEN AU PLUS
 *   RÉCENT (déjà triés + sans brouillons, cf sortThreadChronological).
 * @return {{kind: "reply"|"relance", target: object|null, recipient: string}}
 *   - kind     : réponse (client a parlé) ou relance (Trendl a parlé) ;
 *   - target   : le message qui sert de contexte au prompt (le dernier du fil) ;
 *   - recipient: adresse de l'interlocuteur externe (jamais Trendl).
 */
function resolveReplyTargetAndKind(ordered) {
  const msgs = Array.isArray(ordered) ? ordered.filter(Boolean) : [];
  if (msgs.length === 0) return {kind: "reply", target: null, recipient: ""};

  const last = msgs[msgs.length - 1];
  const lastDir = messageDirection(last.labels);

  // Derniers messages par direction (msgs est chronologique).
  let lastInbound = null;
  let lastOutbound = null;
  for (const m of msgs) {
    if (messageDirection(m.labels) === "inbound") lastInbound = m;
    else lastOutbound = m;
  }

  // Destinataire = l'interlocuteur EXTERNE, jamais Trendl.
  let recipient = "";
  if (lastInbound) {
    recipient = extractEmail(lastInbound.reply_to || lastInbound.from);
  } else if (lastOutbound) {
    recipient = extractEmail(lastOutbound.to);
  }

  // Dernier message ENTRANT → on répond ; SORTANT → on relance.
  const kind = lastDir === "inbound" ? "reply" : "relance";
  return {kind, target: last, recipient};
}

module.exports = {resolveReplyTargetAndKind, extractEmail};
