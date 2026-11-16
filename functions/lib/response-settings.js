/**
 * Lecture serveur des Response Settings (Sprint 26 PR4).
 *
 * Document `app_settings/response_v1` (repris de Trendl). Quantique : pas
 * d'écran de réglage dans le package ; le ton, la longueur et la langue
 * viennent de la configuration de marque (champ `assistant`), transmise
 * par l'application. Ce document reste utile pour la signature par défaut
 * et les « règles à éviter » (à renseigner dans la console Firebase). Les Cloud Functions
 * lisent le même doc via firebase-admin pour construire les prompts IA.
 *
 * Pas de cache côté serveur en V1 : 1 read Firestore par appel CF
 * (trivial). Si besoin d'un cache 5 min plus tard, ajouter ici sans
 * impacter les call-sites.
 */

const {db} = require("./firebase-admin");

const COLLECTION = "app_settings";
const DOC_ID = "response_v1";

const DEFAULT_RESPONSE_SETTINGS = Object.freeze({
  tone: "casual",
  length: "medium",
  signature: "",
  rules_avoid: "",
  language_default: "fr",
  include_voice_profile: true,
});

/**
 * Lit le doc Firestore et merge avec les défauts. Robuste si le doc
 * n'existe pas encore (1ère utilisation de la feature).
 *
 * @return {Promise<object>} Response Settings normalisés
 */
async function readResponseSettings() {
  const snap = await db.collection(COLLECTION).doc(DOC_ID).get();
  if (!snap.exists) {
    return {...DEFAULT_RESPONSE_SETTINGS};
  }
  const data = snap.data() || {};
  return {...DEFAULT_RESPONSE_SETTINGS, ...data};
}

module.exports = {
  readResponseSettings,
  DEFAULT_RESPONSE_SETTINGS,
};
