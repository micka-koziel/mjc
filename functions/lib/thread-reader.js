/**
 * thread-reader.js — Sprint 87.
 *
 * Lecture d'un FIL de discussion complet (tous les messages d'un même
 * threadId Gmail) et dérivation de signaux temporels dénormalisables sur
 * l'opportunité rattachée.
 *
 * Deux parties :
 *  - deriveThreadSignals(messages)   : PUR (testable sans Firestore) ;
 *  - sortThreadChronological(msgs)   : PUR ;
 *  - readThreadMessages(db, threadId): I/O Firestore (query where threadId).
 *
 * Contexte (retour cutover Max, 25/07) : le socle « rafraîchissement au retour
 * de la marque » (résumé du fil + brouillon de réponse pré-généré) a besoin
 * (a) de tout le fil pour la synthèse IA, (b) de dates dénormalisées (dernier
 * message entrant/sortant) pour piloter, côté home, le réveil d'une carte
 * « traitée » quand la marque répond.
 */

const {messageDirection, isDraftMessage} = require("./message-direction");

/** Millisecondes d'une valeur date hétérogène (Timestamp / Date / ISO / ms). */
function toMillis(value) {
  if (value === null || value === undefined) return null;
  if (typeof value === "number") return Number.isFinite(value) ? value : null;
  if (typeof value.toMillis === "function") {
    try {
      return value.toMillis();
    } catch {
      return null;
    }
  }
  if (typeof value.toDate === "function") {
    try {
      return value.toDate().getTime();
    } catch {
      return null;
    }
  }
  const t = new Date(value).getTime();
  return Number.isNaN(t) ? null : t;
}

/**
 * Dérive les signaux temporels d'un fil. PUR. Ignore les brouillons Gmail.
 *
 * @param {Array<object>} messages docs message ({id, receivedAt, labels})
 * @return {{
 *   lastMessageAtMs: number|null,
 *   lastInboundAtMs: number|null,
 *   lastOutboundAtMs: number|null,
 *   lastMessageId: string|null,
 *   lastInboundMessageId: string|null,
 *   count: number
 * }}
 */
function deriveThreadSignals(messages = []) {
  let lastMessageAtMs = null;
  let lastInboundAtMs = null;
  let lastOutboundAtMs = null;
  let lastMessageId = null;
  let lastInboundMessageId = null;
  let count = 0;
  for (const m of messages) {
    if (!m) continue;
    if (isDraftMessage(m.labels)) continue; // un brouillon n'est pas un message du fil
    count += 1;
    const ms = toMillis(m.receivedAt);
    if (ms === null) continue;
    if (lastMessageAtMs === null || ms > lastMessageAtMs) {
      lastMessageAtMs = ms;
      lastMessageId = m.id || null;
    }
    const dir = messageDirection(m.labels);
    if (dir === "inbound") {
      if (lastInboundAtMs === null || ms > lastInboundAtMs) {
        lastInboundAtMs = ms;
        lastInboundMessageId = m.id || null;
      }
    } else if (dir === "outbound") {
      if (lastOutboundAtMs === null || ms > lastOutboundAtMs) {
        lastOutboundAtMs = ms;
      }
    }
  }
  return {
    lastMessageAtMs,
    lastInboundAtMs,
    lastOutboundAtMs,
    lastMessageId,
    lastInboundMessageId,
    count,
  };
}

/**
 * Ordonne les messages du plus ancien au plus récent (pour le prompt de
 * synthèse). PUR. Écarte les brouillons.
 */
function sortThreadChronological(messages = []) {
  return [...messages]
    .filter((m) => m && !isDraftMessage(m.labels))
    .sort((a, b) => (toMillis(a.receivedAt) || 0) - (toMillis(b.receivedAt) || 0));
}

/**
 * Lit tous les messages d'un fil depuis Firestore (admin SDK). Query simple
 * `where('threadId','==', threadId)` — champ single, index automatique, pas
 * d'index composite à déployer. Borne de sécurité (un fil normal = quelques
 * messages).
 *
 * @param {FirebaseFirestore.Firestore} db
 * @param {string} threadId
 * @param {number} [max=100]
 * @return {Promise<Array<object>>}
 */
async function readThreadMessages(db, threadId, max = 100) {
  if (!threadId) return [];
  const snap = await db
    .collection("messages")
    .where("threadId", "==", threadId)
    .limit(max)
    .get();
  return snap.docs.map((d) => ({id: d.id, ...d.data()}));
}

module.exports = {
  toMillis,
  deriveThreadSignals,
  sortThreadChronological,
  readThreadMessages,
};
