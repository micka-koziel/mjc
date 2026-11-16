/**
 * Helpers Google Secret Manager.
 *
 * - readSecret(name)         : récupère la dernière version d'un secret
 * - writeSecret(name, value) : crée une nouvelle version (et crée le secret s'il n'existe pas)
 *
 * Le project ID est lu depuis l'environnement Cloud Functions
 * (GCLOUD_PROJECT ou GOOGLE_CLOUD_PROJECT, injectés automatiquement).
 *
 * Sprint 92 (B185) — CHARGEMENT PARESSEUX.
 *   Ce module était chargé en cascade par presque toutes les Cloud Functions
 *   (toute fonction qui lit un secret). Or `@google-cloud/secret-manager`
 *   embarque gRPC et google-gax : ~160 fichiers, et l'ancienne version
 *   instanciait EN PLUS le client (`new SecretManagerServiceClient()`) au simple
 *   `require`. Au déploiement, Firebase charge les 77 fonctions d'un coup pour
 *   les découvrir : ce coût était payé même pour les fonctions qui ne lisent
 *   jamais de secret, et le délai de découverte (plafond 10 s) était frôlé.
 *
 *   Le SDK n'est donc plus chargé qu'au PREMIER appel réel à readSecret /
 *   writeSecret, et le client est mis en cache pour les appels suivants. À
 *   l'exécution, le coût est identique (une seule fois par instance) ; au
 *   déploiement, il disparaît. Même principe que lib/sentry.js (S57).
 */

/** Client Secret Manager, instancié au premier usage réel puis conservé. */
let cachedClient = null;

/**
 * Retourne le client Secret Manager, en le créant au premier appel.
 * Le `require` du SDK est volontairement ici et pas en tête de fichier.
 *
 * @return {import("@google-cloud/secret-manager").SecretManagerServiceClient}
 */
function getClient() {
  if (!cachedClient) {
    const {
      SecretManagerServiceClient,
    } = require("@google-cloud/secret-manager");
    cachedClient = new SecretManagerServiceClient();
  }
  return cachedClient;
}

/**
 * Identifiant du projet GCP courant. Lu à chaque appel (et non figé au
 * chargement) : en test, l'environnement peut être posé après le require.
 *
 * @return {string|undefined} Identifiant du projet
 */
function getProjectId() {
  return process.env.GCLOUD_PROJECT || process.env.GOOGLE_CLOUD_PROJECT;
}

/**
 * Lit la dernière version d'un secret.
 * @param {string} name Nom du secret (ex: "GMAIL_REFRESH_TOKEN")
 * @return {Promise<string>} Valeur du secret en clair
 */
async function readSecret(name) {
  const [version] = await getClient().accessSecretVersion({
    name: `projects/${getProjectId()}/secrets/${name}/versions/latest`,
  });
  return version.payload.data.toString("utf8");
}

/**
 * Écrit une nouvelle version d'un secret.
 * Crée le secret s'il n'existe pas encore.
 * @param {string} name Nom du secret
 * @param {string} value Valeur à stocker
 * @return {Promise<void>}
 */
async function writeSecret(name, value) {
  const client = getClient();
  const parent = `projects/${getProjectId()}`;
  const secretPath = `${parent}/secrets/${name}`;

  // Crée le secret s'il n'existe pas (code 5 = NOT_FOUND)
  try {
    await client.getSecret({name: secretPath});
  } catch (err) {
    if (err.code === 5) {
      await client.createSecret({
        parent,
        secretId: name,
        secret: {replication: {automatic: {}}},
      });
    } else {
      throw err;
    }
  }

  // Ajoute une nouvelle version
  await client.addSecretVersion({
    parent: secretPath,
    payload: {data: Buffer.from(value, "utf8")},
  });
}

module.exports = {readSecret, writeSecret};
