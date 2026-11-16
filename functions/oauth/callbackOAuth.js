/**
 * HTTPS function : callback OAuth Gmail.
 *
 * Appelée par Google après que l'utilisateur a accepté les permissions.
 * Reçoit un `code` d'autorisation dans l'URL (?code=xxx).
 * Échange ce code contre un refresh token et le stocke dans Secret Manager
 * sous la clé GMAIL_REFRESH_TOKEN.
 *
 * Variables d'environnement requises : GMAIL_CLIENT_ID, GMAIL_REDIRECT_URI
 * Secrets requis : GMAIL_CLIENT_SECRET
 * Secrets écrits : GMAIL_REFRESH_TOKEN
 */

const { onRequest } = require("firebase-functions/v2/https");
const { logger } = require("firebase-functions");
const { createOAuthClient } = require("../lib/gmail-client");
const { writeSecret } = require("../lib/secret-manager");
const { db } = require("../lib/firebase-admin");
const { consumeState } = require("../lib/oauth-state");

exports.callbackOAuth = onRequest(
  {
    // KHentik : même région que les autres fonctions HTTP (une seule URL de base).
    region: "europe-west1",
    invoker: "public", // Google appelle cet endpoint sans auth ; gardé par le state
    secrets: ["GMAIL_CLIENT_SECRET"],
  },
  async (req, res) => {
    try {
      const code = req.query.code;
      if (!code) {
        logger.warn("callbackOAuth called without code");
        res.status(400).send("Code OAuth manquant dans l'URL.");
        return;
      }

      // A4 : on n'accepte un callback que s'il correspond à un flow qu'on a
      // nous-mêmes initié (jeton state émis par initOAuth, à usage unique).
      // Sans ce contrôle, un tiers pourrait écraser le refresh token de prod.
      const stateOk = await consumeState(db, req.query.state);
      if (!stateOk) {
        logger.warn("callbackOAuth: invalid or expired state — refused");
        res.status(403).send(
          "Requete OAuth invalide ou expiree. " +
          "Relance la connexion Gmail depuis l'application.",
        );
        return;
      }

      const oauth2Client = await createOAuthClient();
      const { tokens } = await oauth2Client.getToken(code);

      if (!tokens.refresh_token) {
        logger.warn("OAuth flow returned no refresh_token (user already authorized?)");
        res.status(500).send(
          "Pas de refresh token retourne. " +
          "Aller sur https://myaccount.google.com/permissions, " +
          "revoquer l'acces a l'application, puis relancer le flow.",
        );
        return;
      }

      await writeSecret("GMAIL_REFRESH_TOKEN", tokens.refresh_token);
      logger.info("Refresh token stored in Secret Manager");

      res.send(
        "<h1>OK - Connexion Gmail reussie</h1>" +
        "<p>Le refresh token a ete stocke dans Secret Manager.</p>" +
        "<p>Tu peux fermer cet onglet.</p>",
      );
    } catch (err) {
      logger.error("callbackOAuth error", { error: err.message, stack: err.stack });
      res.status(500).send("Erreur callback OAuth: " + err.message);
    }
  },
);
