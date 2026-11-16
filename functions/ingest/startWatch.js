/**
 * HTTPS function startWatch — démarre le watch Gmail Pub/Sub.
 *
 * À appeler UNE FOIS après le flow OAuth pour initier le suivi de la boîte.
 * Le watch expire ensuite après 7 jours max → renouvelé par cron renewWatch.
 *
 * Sécurité Sprint 11+ : vérification d'un Bearer token (ID token Firebase Auth)
 * et check d'appartenance à la whitelist admin avant d'autoriser le déclenchement.
 *
 * Variables d'environnement : GMAIL_WATCH_TOPIC (optionnel, défaut codé dans watch-helpers.js)
 * Secrets : GMAIL_CLIENT_SECRET, GMAIL_REFRESH_TOKEN
 */

const { onRequest } = require("firebase-functions/v2/https");
const { logger } = require("firebase-functions");
const { performWatch } = require("../lib/watch-helpers");
const { requireAdmin } = require("../lib/admin-auth");
const { ALLOWED_ORIGINS } = require("../lib/cors");
const { maskEmail } = require("../lib/log-redact");

exports.startWatch = onRequest(
  {
    // Quantique : même région que les autres fonctions HTTP (une seule URL de base).
    region: "europe-west1",
    invoker: "public",
    secrets: ["GMAIL_CLIENT_SECRET", "GMAIL_REFRESH_TOKEN"],
    cors: ALLOWED_ORIGINS,
  },
  async (req, res) => {
    try {
      const adminEmail = await requireAdmin(req);
      logger.info("startWatch invoked by admin", { adminEmail: maskEmail(adminEmail) });

      const { historyId, expirationMs } = await performWatch("started");

      // Quantique : réponse JSON (lue par le bouton de l'application).
      res.json({ ok: true, historyId: String(historyId), expiration: new Date(expirationMs).toISOString() });
    } catch (err) {
      const status = err.status || 500;
      logger.error("startWatch error", { error: err.message, status });
      res.status(status).json({ error: "Activation de la réception impossible : " + err.message });
    }
  },
);
