/**
 * HTTPS function : démarre le flow OAuth Gmail.
 *
 * Sprint 58 (A4) — Sécurisation du bootstrap OAuth.
 * Avant : endpoint public qui redirigeait directement vers Google ; couplé à un
 * callbackOAuth non protégé, un tiers pouvait écraser le refresh token de PROD.
 * Maintenant :
 *  - Réservé admin : appelé en POST avec un Bearer ID token Firebase (comme
 *    startWatch). Plus aucune navigation anonyme ne démarre le flow.
 *  - Émet un jeton anti-CSRF (« state ») à usage unique, vérifié au retour par
 *    callbackOAuth (cf lib/oauth-state.js).
 *  - Renvoie l'URL de consentement en JSON ({ url }) ; c'est le front qui
 *    redirige ensuite le navigateur vers Google.
 *
 * Variables d'environnement requises : GMAIL_CLIENT_ID, GMAIL_REDIRECT_URI
 * Secrets requis : GMAIL_CLIENT_SECRET
 */

const { onRequest } = require("firebase-functions/v2/https");
const { logger } = require("firebase-functions");
const { createOAuthClient } = require("../lib/gmail-client");
const { requireAdmin } = require("../lib/admin-auth");
const { ALLOWED_ORIGINS } = require("../lib/cors");
const { db } = require("../lib/firebase-admin");
const { generateStateToken, persistState } = require("../lib/oauth-state");

// Sprint 21 PR1 : élargi de gmail.readonly à gmail.modify pour permettre
// la sync bidirectionnelle (trash, label, archive) depuis Trendl vers Gmail.
//
// Sprint 26 PR4 : ajout de gmail.send pour permettre l'envoi de brouillons
// IA depuis le ReplyDraftDrawer. Re-consent forcé via prompt: "consent"
// ci-dessous. Le refresh token précédent est invalidé, l'admin doit
// repasser par /initOAuth une fois après le déploiement (cf
// 09-Documentation/04-Runbook-ops/03-Gestion-secrets.md mis à jour PR4).
//
// gmail.modify + gmail.send inclut :
//  - lecture (gmail.readonly)
//  - ajout/retrait de labels (modify)
//  - trash / untrash (modify)
//  - création de brouillons (modify)
//  - envoi de messages (send)
//  - PAS de hard delete (resterait gmail.full, non utilisé ici)
const SCOPES = [
  "https://www.googleapis.com/auth/gmail.modify",
  "https://www.googleapis.com/auth/gmail.send",
];

exports.initOAuth = onRequest(
  {
    // Quantique : même région que les autres fonctions HTTP (une seule URL de base).
    region: "europe-west1",
    invoker: "public", // IAM ouvert ; l'auth applicative est faite par requireAdmin
    secrets: ["GMAIL_CLIENT_SECRET"],
    cors: ALLOWED_ORIGINS,
  },
  async (req, res) => {
    try {
      // A4 : seul un admin authentifié peut démarrer le flow OAuth.
      await requireAdmin(req);

      // A4 : jeton anti-CSRF à usage unique, vérifié au retour (callbackOAuth).
      const state = generateStateToken();
      await persistState(db, state);

      const oauth2Client = await createOAuthClient();
      const url = oauth2Client.generateAuthUrl({
        access_type: "offline", // requis pour obtenir un refresh token
        prompt: "consent", // force le consent même si déjà autorisé
        scope: SCOPES,
        state, // renvoyé par Google à callbackOAuth, vérifié là-bas
      });
      logger.info("initOAuth: flow started by admin", { scopes: SCOPES });
      res.json({ url });
    } catch (err) {
      const status = err.status || 500;
      logger.error("initOAuth error", { error: err.message, status });
      res.status(status).json({ error: err.message });
    }
  },
);
