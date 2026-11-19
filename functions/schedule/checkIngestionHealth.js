/**
 * Scheduled function checkIngestionHealth — auto-recovery du watch Gmail.
 *
 * Pourquoi cette function (Sprint 14, cause racine traitée enfin) :
 *
 * À chaque `firebase deploy --only functions` qui touche `ingestEmail`
 * (ou ses helpers), Firebase recrée la Cloud Function avec une NOUVELLE
 * subscription Pub/Sub. Le watch Gmail côté Google garde son ancien topic
 * et continue de notifier dans le vide → silence radio jusqu'au prochain
 * cron `renewWatch` quotidien (potentiellement 24h dans le noir).
 *
 * Cette function tourne TOUTES LES 30 MIN, lit `lastIngestAt`, et si
 * elle est vieille de plus de 2h (ou null) → relance automatiquement
 * `performWatch("recovery")` pour ré-armer une subscription fraîche.
 *
 * Séparation des responsabilités :
 *   - renewWatch              (1x/jour 03:00 UTC) : renouvelle avant expiration 7j
 *   - checkIngestionHealth    (toutes les 30 min) : détecte les pannes Pub/Sub
 *
 * Cela évite de spammer Gmail API avec users.watch 48x/jour inutilement,
 * tout en garantissant un délai max de 30 min entre un deploy cassant et
 * la reprise de l'ingestion.
 *
 * Schedule : toutes les 30 minutes (voir SCHEDULE_CRON ci-dessous).
 * Region   : us-central1 (cohérent avec les autres scheduled functions).
 * Secrets  : GMAIL_CLIENT_SECRET, GMAIL_REFRESH_TOKEN.
 */

const { isSimulatedMailbox } = require("../lib/simulated-mailbox");
const { onSchedule } = require("firebase-functions/v2/scheduler");
const { logger } = require("firebase-functions");
const { db, admin } = require("../lib/firebase-admin");
const { performWatch } = require("../lib/watch-helpers");
const {
  RECOVERY_ALERT_THRESHOLD,
  shouldAlertRecovery,
} = require("../lib/ingestion-health");
const { captureException } = require("../lib/sentry");

const WATCH_DOC = "system/gmail-watch";

// Cron : toutes les 30 minutes (à xx:00 et xx:30 UTC).
const SCHEDULE_CRON = "*/30 * * * *";

// Seuil au-delà duquel on considère l'ingestion en panne.
// 2h = laisse de la marge pour les périodes calmes (week-end, soirée) sans
// fausse alarme, tout en réagissant assez vite à un vrai blocage post-deploy.
const STALE_THRESHOLD_MS = 2 * 60 * 60 * 1000;

// Sprint 57 (Action 1 d'Alex, constat M07-R7) — le healthcheck ne doit plus
// MASQUER un échec de reprise DURABLE. Avant, le catch avalait l'erreur sans
// rien signaler : si la reprise du watch échouait 48 fois d'affilée, l'ingestion
// restait morte et personne ne le savait. On compte désormais les échecs
// consécutifs et, au-delà de ce seuil, on émet un log d'ERREUR avec un marqueur
// stable (`alert: "ingestion_recovery_failing"`) qu'une alerte Cloud Monitoring
// (PR3) capte pour prévenir par email. Un échec ponctuel (1-2) reste un warning.
//
// Le seuil et la décision pure vivent dans lib/ingestion-health.js (testable).

exports.checkIngestionHealth = onSchedule(
  {
    schedule: SCHEDULE_CRON,
    timeZone: "Etc/UTC",
    region: "us-central1",
    secrets: ["GMAIL_CLIENT_SECRET", "GMAIL_REFRESH_TOKEN"],
  },
  async () => {
    if (isSimulatedMailbox()) return; // boîte de démonstration : pas de Gmail
    try {
      const snap = await db.doc(WATCH_DOC).get();
      const data = snap.exists ? snap.data() : {};
      const lastIngestAt = data.lastIngestAt;

      // Convertir Firestore Timestamp → ms epoch (compatible toDate() / _seconds).
      const lastIngestMs =
        lastIngestAt && typeof lastIngestAt.toDate === "function"
          ? lastIngestAt.toDate().getTime()
          : null;

      const now = Date.now();
      const ageMs = lastIngestMs ? now - lastIngestMs : null;
      const isStale = lastIngestMs === null || ageMs > STALE_THRESHOLD_MS;

      logger.info("checkIngestionHealth — état", {
        lastIngestAt: lastIngestMs
          ? new Date(lastIngestMs).toISOString()
          : null,
        ageMinutes: ageMs ? Math.round(ageMs / 60000) : null,
        thresholdMinutes: STALE_THRESHOLD_MS / 60000,
        isStale,
      });

      if (!isStale) {
        logger.info("checkIngestionHealth — healthy, no action");
        return;
      }

      // Ingestion silencieuse → on relance le watch en mode "recovery"
      logger.warn("checkIngestionHealth — auto-recovery triggered", {
        ageMinutes: ageMs ? Math.round(ageMs / 60000) : "null (jamais ingéré)",
      });

      const { historyId, expirationMs } = await performWatch("recovery");

      // Reprise réussie → on remet le compteur d'échecs à zéro et on horodate.
      await db.doc(WATCH_DOC).set(
        {
          recovery_consecutive_failures: 0,
          last_recovery_success_at:
            admin.firestore.FieldValue.serverTimestamp(),
          last_recovery_error: null,
        },
        { merge: true },
      );

      logger.info("checkIngestionHealth — recovery success", {
        newHistoryId: historyId,
        watchExpiration: new Date(expirationMs).toISOString(),
      });
    } catch (err) {
      // Échec de reprise : on INCRÉMENTE le compteur d'échecs consécutifs et on
      // persiste l'erreur. On ne throw PAS (éviter une tempête de retries — la
      // function repassera dans 30 min), mais on n'avale plus l'échec en
      // silence : au-delà du seuil, on émet une vraie ALERTE.
      const failures = await recordRecoveryFailure(err);

      const payload = {
        error: err.message,
        stack: err.stack,
        consecutiveFailures: failures,
      };

      if (shouldAlertRecovery(failures)) {
        // Marqueur stable capté par Cloud Monitoring (PR3) → email d'alerte.
        logger.error("checkIngestionHealth — recovery failing", {
          ...payload,
          alert: "ingestion_recovery_failing",
        });
        // Sentry : stack trace + notification sur panne durable (PR4).
        await captureException(err, {
          fn: "checkIngestionHealth",
          alert: "ingestion_recovery_failing",
          consecutiveFailures: failures,
        });
      } else {
        logger.warn("checkIngestionHealth — recovery attempt failed", payload);
      }
    }
  },
);

/**
 * Incrémente le compteur d'échecs de reprise consécutifs dans le doc de watch
 * et persiste l'erreur. Renvoie le nouveau total (pour décider d'alerter).
 * Tolère un souci d'écriture Firestore (on ne veut pas masquer l'erreur
 * d'origine derrière une erreur de compteur).
 *
 * @param {Error} err Erreur de reprise à journaliser
 * @return {Promise<number>} Nombre d'échecs consécutifs après incrément
 */
async function recordRecoveryFailure(err) {
  try {
    const snap = await db.doc(WATCH_DOC).get();
    const prev =
      (snap.exists && snap.data().recovery_consecutive_failures) || 0;
    const failures = prev + 1;

    await db.doc(WATCH_DOC).set(
      {
        recovery_consecutive_failures: failures,
        last_recovery_error: err.message,
        last_recovery_attempt_at: admin.firestore.FieldValue.serverTimestamp(),
      },
      { merge: true },
    );

    return failures;
  } catch (e2) {
    logger.error("checkIngestionHealth — cannot persist failure counter", {
      error: e2.message,
    });
    // On renvoie le seuil d'alerte pour ne PAS rater une alerte si le compteur
    // est cassé : mieux vaut une alerte de trop qu'un silence.
    return RECOVERY_ALERT_THRESHOLD;
  }
}
