/**
 * sentry.js — capture des plantages des Cloud Functions (Sprint 57, Action 1
 * d'Alex). Sentry reçoit les exceptions avec leur stack trace et notifie, ce que
 * les logs bruts ne font pas. Complète Cloud Monitoring (qui, lui, alerte sur des
 * métriques : coût, quotas, marqueurs).
 *
 * Conception « zéro-friction » :
 *   - Le DSN Sentry vit dans la variable d'environnement SENTRY_DSN
 *     (functions/.env, gitignoré ; cf .env.example). Ce n'est pas un secret
 *     sensible (un DSN sert juste de point d'envoi), donc pas besoin de Secret
 *     Manager.
 *   - Si SENTRY_DSN est ABSENT (dev local, ou avant configuration), tout est
 *     NO-OP : aucune dépendance chargée, aucune erreur. L'app tourne pareil.
 *   - @sentry/node n'est chargé qu'en LAZY (require au premier usage réel), pour
 *     ne pas alourdir le démarrage des fonctions qui ne plantent jamais, ni
 *     casser les tests qui n'ont pas la lib.
 *
 * Usage :
 *   - initSentry()                    : à appeler une fois au chargement (index.js)
 *   - await captureException(err, ctx): dans un catch, pour signaler un plantage
 */

let initialized = false;

/**
 * Sentry est-il activable ? (= un DSN est-il fourni dans l'environnement ?)
 * Fonction PURE, testable, sans effet de bord ni dépendance.
 *
 * @param {object} [env=process.env] Environnement à inspecter
 * @return {boolean} true si un SENTRY_DSN non vide est présent
 */
function shouldEnableSentry(env = process.env) {
  return Boolean(env && env.SENTRY_DSN);
}

/**
 * Initialise Sentry une seule fois par instance de fonction. No-op (et renvoie
 * false) si aucun DSN n'est configuré. Idempotent.
 *
 * @return {boolean} true si Sentry est actif après l'appel
 */
function initSentry() {
  if (initialized) {
    return true;
  }
  if (!shouldEnableSentry()) {
    return false;
  }
  const Sentry = require("@sentry/node");
  Sentry.init({
    dsn: process.env.SENTRY_DSN,
    environment: process.env.SENTRY_ENV || "production",
    // Pas de tracing de performance : on veut seulement les erreurs.
    tracesSampleRate: 0,
  });
  initialized = true;
  return true;
}

/**
 * Signale une exception à Sentry, avec un contexte optionnel. Ne throw JAMAIS
 * (l'observabilité ne doit pas casser le chemin métier). À AWAIT dans un catch :
 * en environnement serverless, l'instance peut « geler » dès le retour de la
 * fonction, donc on FLUSH pour garantir l'envoi avant de rendre la main.
 *
 * @param {Error} err Erreur à signaler
 * @param {object} [context={}] Données contextuelles (fn, ids, marqueur d'alerte…)
 * @return {Promise<void>}
 */
async function captureException(err, context = {}) {
  try {
    if (!initSentry()) {
      return; // Pas de DSN configuré → no-op silencieux.
    }
    const Sentry = require("@sentry/node");
    Sentry.captureException(err, { extra: context });
    await Sentry.flush(2000);
  } catch (e) {
    // Un échec d'envoi à Sentry ne doit jamais masquer l'erreur d'origine.
    require("firebase-functions").logger.error(
      "captureException — échec envoi Sentry (non bloquant)",
      { error: e && e.message },
    );
  }
}

module.exports = {
  shouldEnableSentry,
  initSentry,
  captureException,
};
