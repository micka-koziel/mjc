/**
 * Scheduled function renewWatch — renouvelle le watch Gmail tous les jours.
 *
 * Le watch Gmail expire après 7 jours max. On le renouvelle quotidiennement
 * pour avoir une marge de sécurité (~6 jours).
 *
 * Schedule : tous les jours à 03:00 UTC.
 *
 * Variables d'environnement : GMAIL_WATCH_TOPIC (optionnel)
 * Secrets : GMAIL_CLIENT_SECRET, GMAIL_REFRESH_TOKEN
 */

const { onSchedule } = require("firebase-functions/v2/scheduler");
const { logger } = require("firebase-functions");
const { performWatch } = require("../lib/watch-helpers");

exports.renewWatch = onSchedule(
  {
    schedule: "0 3 * * *",
    timeZone: "Etc/UTC",
    secrets: ["GMAIL_CLIENT_SECRET", "GMAIL_REFRESH_TOKEN"],
  },
  async () => {
    try {
      const { expirationMs } = await performWatch("renewed");
      logger.info("Watch renewed", {
        expiration: new Date(expirationMs).toISOString(),
      });
    } catch (err) {
      logger.error("renewWatch error", { error: err.message });
      throw err;
    }
  },
);
