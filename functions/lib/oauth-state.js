/**
 * oauth-state.js — Jeton anti-CSRF (« state ») pour le flow OAuth Gmail.
 *
 * Sprint 58 (A4) — Sécurisation du bootstrap OAuth.
 *
 * Problème corrigé : avant ce sprint, callbackOAuth acceptait n'importe quel
 * appel et écrasait le refresh token Gmail de PRODUCTION. Un tiers pouvait donc
 * détourner la boîte. On introduit un jeton « state » à usage unique :
 *
 *  1. initOAuth (réservé admin) génère un state aléatoire, le stocke côté
 *     serveur (Firestore) avec un TTL court, puis le transmet à Google.
 *  2. Google renvoie ce state à callbackOAuth.
 *  3. callbackOAuth vérifie que le state existe, n'est pas périmé, puis le
 *     consomme (usage unique). Sans state valide → refus.
 *
 * Métaphore : un ticket de vestiaire. On ne rend le manteau (le token) qu'à qui
 * présente un ticket qu'on a soi-même émis, et le ticket est déchiré après usage.
 *
 * Les fonctions de calcul pur (génération, fraîcheur) sont séparées des I/O
 * Firestore pour rester testables sans charger Firebase.
 */

const crypto = require("crypto");

const COLLECTION = "oauth_states";
const DEFAULT_TTL_MS = 10 * 60 * 1000; // 10 minutes

/**
 * Génère un jeton state aléatoire (256 bits, hex). Pur.
 * @return {string}
 */
function generateStateToken() {
  return crypto.randomBytes(32).toString("hex");
}

/**
 * Vérifie qu'un state n'est pas périmé (ni daté du futur). Pur.
 * @param {number} createdAtMs - timestamp d'émission (ms)
 * @param {number} nowMs - timestamp courant (ms)
 * @param {number} [ttlMs] - durée de validité (ms)
 * @return {boolean}
 */
function isStateFresh(createdAtMs, nowMs, ttlMs = DEFAULT_TTL_MS) {
  if (typeof createdAtMs !== "number" || Number.isNaN(createdAtMs)) return false;
  return nowMs >= createdAtMs && nowMs - createdAtMs <= ttlMs;
}

/**
 * Persiste un state émis (I/O Firestore).
 * @param {import("firebase-admin").firestore.Firestore} db
 * @param {string} token
 * @param {{adminEmail?: string}} [meta]
 * @return {Promise<void>}
 */
async function persistState(db, token, meta = {}) {
  await db.collection(COLLECTION).doc(token).set({
    created_at: Date.now(),
    admin_email: meta.adminEmail || null,
  });
}

/**
 * Consomme un state (usage unique). Retourne true s'il était présent ET frais.
 * Supprime toujours le doc s'il existe (anti-rejeu), même périmé.
 * @param {import("firebase-admin").firestore.Firestore} db
 * @param {string} token
 * @param {number} [ttlMs]
 * @return {Promise<boolean>}
 */
async function consumeState(db, token, ttlMs = DEFAULT_TTL_MS) {
  if (!token || typeof token !== "string") return false;
  const ref = db.collection(COLLECTION).doc(token);
  const snap = await ref.get();
  if (!snap.exists) return false;
  const data = snap.data();
  await ref.delete(); // usage unique : déchiré qu'il soit frais ou non
  return isStateFresh(data.created_at, Date.now(), ttlMs);
}

module.exports = {
  COLLECTION,
  DEFAULT_TTL_MS,
  generateStateToken,
  isStateFresh,
  persistState,
  consumeState,
};
