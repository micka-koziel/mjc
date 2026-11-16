/**
 * dead-letter.js — File de messages « poison » (quarantaine après N échecs).
 *
 * Sprint 68 (Action 18 d'Alex, constat M04-R3).
 *
 * LE PROBLÈME. L'ingestion Gmail rejoue (Pub/Sub) tant qu'elle échoue. Un
 * message « poison » — un mail qui fait systématiquement planter le traitement
 * (corps malformé, cas non géré) — bloque alors TOUTE la file derrière lui : on
 * replante en boucle, le curseur n'avance jamais, plus aucun mail légitime n'est
 * ingéré. (Les 404 « message disparu » sont déjà gérés à part ; ici on parle des
 * échecs RÉCURRENTS sur un message présent.)
 *
 * LA PARADE — une « dead-letter queue ». On compte les tentatives par message
 * dans `dead_letter_messages/{gmailId}`. Sous le seuil, on laisse rejouer
 * (l'échec peut être transitoire). Au-delà du seuil, on MET LE MESSAGE EN
 * QUARANTAINE : on l'écarte du traitement (sans le perdre — il reste tracé pour
 * inspection) afin que la file reprenne. Métaphore : un colis qui bloque le tapis
 * roulant est mis de côté sur une étagère « à examiner » pour que les suivants
 * passent.
 *
 * La décision (« faut-il mettre en quarantaine ? ») est une fonction PURE
 * testable ; l'état vit dans Firestore (compteur transactionnel idempotent).
 */

// Nombre de tentatives infructueuses avant mise en quarantaine.
const MAX_ATTEMPTS = 5;
const COLLECTION = "dead_letter_messages";

/**
 * Décision pure : ce nombre de tentatives atteint-il le seuil de quarantaine ?
 *
 * @param {number} attempts
 * @param {number} [max=MAX_ATTEMPTS]
 * @return {boolean}
 */
function shouldQuarantine(attempts, max = MAX_ATTEMPTS) {
  return Number(attempts) >= Number(max);
}

/**
 * Enregistre une tentative échouée sur un message et renvoie l'état mis à jour.
 * Transactionnel (compteur fiable même en rejeux concurrents).
 *
 * @param {object} deps {db, admin}
 * @param {string} gmailId
 * @param {Error|string} error
 * @return {Promise<{attempts: number, quarantined: boolean}>}
 */
async function recordPoisonAttempt({db, admin}, gmailId, error) {
  const ref = db.collection(COLLECTION).doc(gmailId);
  const message = String(error && error.message ? error.message : error).slice(0, 500);

  return db.runTransaction(async (tx) => {
    const snap = await tx.get(ref);
    const prev = snap.exists ? (snap.data().attempts || 0) : 0;
    const attempts = prev + 1;
    const quarantined = shouldQuarantine(attempts);

    const payload = {
      gmail_id: gmailId,
      attempts,
      quarantined,
      last_error: message,
      last_attempt_at: admin.firestore.FieldValue.serverTimestamp(),
    };
    if (quarantined && !(snap.exists && snap.data().quarantined)) {
      payload.quarantined_at = admin.firestore.FieldValue.serverTimestamp();
    }
    tx.set(ref, payload, {merge: true});

    return {attempts, quarantined};
  });
}

/**
 * Ce message est-il déjà en quarantaine (à ignorer) ?
 *
 * @param {object} deps {db}
 * @param {string} gmailId
 * @return {Promise<boolean>}
 */
async function isQuarantined({db}, gmailId) {
  const snap = await db.collection(COLLECTION).doc(gmailId).get();
  return snap.exists && snap.data().quarantined === true;
}

/**
 * Efface le suivi d'un message une fois ingéré avec succès (nettoie un échec
 * transitoire passé). Best-effort.
 *
 * @param {object} deps {db}
 * @param {string} gmailId
 * @return {Promise<void>}
 */
async function clearPoisonTracking({db}, gmailId) {
  const ref = db.collection(COLLECTION).doc(gmailId);
  const snap = await ref.get();
  if (snap.exists) await ref.delete();
}

module.exports = {
  MAX_ATTEMPTS,
  COLLECTION,
  shouldQuarantine,
  recordPoisonAttempt,
  isQuarantined,
  clearPoisonTracking,
};
