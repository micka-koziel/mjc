/**
 * history-cursor.js — Avance MONOTONE du curseur d'ingestion Gmail.
 *
 * Sprint 68 (Action 18 d'Alex, constat M04-R5).
 *
 * LE PROBLÈME. Le pointeur `lastHistoryId` (system/gmail-watch) dit « jusqu'où
 * j'ai déjà ingéré ». Plusieurs notifications Pub/Sub peuvent être traitées
 * quasi simultanément (relivraisons, rafales). Avec une écriture naïve
 * (`set merge`), une invocation lente porteuse d'un VIEUX historyId peut écraser
 * un curseur déjà plus avancé → on « recule » le pointeur, et au prochain tour
 * on RE-balaye un historique déjà traité (doublons de lecture, risque de boucle).
 *
 * LA PARADE. On avance le curseur DANS UNE TRANSACTION Firestore avec une garde
 * MONOTONE : on ne remplace `lastHistoryId` que si la nouvelle valeur est
 * STRICTEMENT plus grande que l'actuelle. Métaphore : un cliquet (roue à
 * cliquet) qui ne tourne que vers l'avant et se bloque en arrière.
 *
 * Les métadonnées (lastIngestAt, lastIngestedCount) sont toujours écrites — seul
 * le pointeur est protégé.
 *
 * La comparaison vit dans une fonction PURE (`isNewerHistoryId`) testable sans
 * Firestore. Les historyId Gmail sont des entiers croissants, mais transmis en
 * chaîne et potentiellement très grands : on compare en BigInt.
 */

/**
 * La valeur `next` est-elle un historyId strictement plus récent que `current` ?
 * Pur.
 *
 * @param {string|number|null|undefined} next
 * @param {string|number|null|undefined} current
 * @return {boolean}
 */
function isNewerHistoryId(next, current) {
  if (next === null || next === undefined || next === "") return false;
  if (current === null || current === undefined || current === "") return true;
  try {
    return BigInt(String(next)) > BigInt(String(current));
  } catch {
    // Valeurs non numériques (ne devrait pas arriver) : on n'avance que si
    // différent, faute de pouvoir ordonner.
    return String(next) !== String(current);
  }
}

/**
 * Avance le curseur d'historique de façon monotone, en transaction.
 *
 * @param {object} deps
 * @param {FirebaseFirestore.Firestore} deps.db
 * @param {object} deps.admin firebase-admin (pour FieldValue).
 * @param {FirebaseFirestore.DocumentReference} docRef Doc system/gmail-watch.
 * @param {string|undefined} nextHistoryId Candidat de nouveau pointeur.
 * @param {object} [meta] Métadonnées toujours écrites (ex. lastIngestedCount).
 * @return {Promise<{advanced: boolean, current: string|null, next: string|undefined}>}
 */
async function advanceHistoryCursor({db, admin}, docRef, nextHistoryId, meta = {}) {
  return db.runTransaction(async (tx) => {
    const snap = await tx.get(docRef);
    const current = snap.exists ? (snap.data().lastHistoryId || null) : null;
    const advanced = isNewerHistoryId(nextHistoryId, current);

    const payload = {
      ...meta,
      lastIngestAt: admin.firestore.FieldValue.serverTimestamp(),
    };
    if (advanced) {
      payload.lastHistoryId = nextHistoryId;
    }
    tx.set(docRef, payload, {merge: true});

    return {advanced, current, next: nextHistoryId};
  });
}

module.exports = {isNewerHistoryId, advanceHistoryCursor};
