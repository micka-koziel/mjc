/**
 * user-secrets.js — résolution des secrets.
 *
 * Trendl permettait de faire tourner l'application sur les clés d'un
 * « compte exploitant » (console « Clés & accès »). Quantique : une instance
 * par client, donc uniquement les secrets GLOBAUX du projet Firebase
 * (Secret Manager). Exports conservés pour les modules repris.
 */
function getDefaultReadSecret() {
  return require("./secret-manager").readSecret;
}

async function resolveSecret(globalName, deps = {}) {
  return (deps.readSecret || getDefaultReadSecret())(globalName);
}

async function resolveGmailCredentials(deps = {}) {
  const readSecret = deps.readSecret || getDefaultReadSecret();
  const env = deps.env || process.env;
  const [clientSecret, refreshToken] = await Promise.all([
    readSecret("GMAIL_CLIENT_SECRET"),
    readSecret("GMAIL_REFRESH_TOKEN"),
  ]);
  return {clientId: env.GMAIL_CLIENT_ID, clientSecret, refreshToken, source: "global"};
}

module.exports = {resolveSecret, resolveGmailCredentials};
