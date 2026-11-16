/**
 * Client Anthropic — helper singleton pour appeler l'API Claude depuis les Cloud Functions.
 *
 * - getAnthropicClient() : récupère le client Anthropic, initialisé une seule fois par instance.
 *                          La clé API est chargée depuis Secret Manager au premier appel (lazy init).
 * - MODEL_HAIKU         : modèle rapide & pas cher, pour l'Étape 0 (classification).
 * - MODEL_SONNET        : modèle qualitatif, pour les Étapes 1-2 (parsing structuré + matching CRM).
 *
 * Pattern aligné sur lib/gmail-client.js : pas d'init au require, lazy + cache.
 *
 * Le secret ANTHROPIC_API_KEY est créé manuellement dans Secret Manager (cf
 * 09-Documentation/04-Runbook-ops/03-Gestion-secrets.md). Le service account des
 * Cloud Functions (trendl-app@appspot.gserviceaccount.com) doit avoir le rôle
 * roles/secretmanager.secretAccessor sur ce secret.
 */

// Sprint 92 (B185) — le SDK Anthropic (~96 fichiers) n'est PLUS chargé au
// require de ce module. Il l'était pour les 77 fonctions au moment de la
// découverte au déploiement, alors qu'une poignée seulement appelle Claude.
// Chargement déplacé dans getAnthropicClient(), au premier appel réel.
// Sprint 82 (B157) — la clé est résolue via le compte exploitant (repli global).
const {resolveSecret} = require("./user-secrets");
const {recordAnthropicUsage} = require("./observability");
const {protectAiClient} = require("./text-safe");
const {
  assertWithinAiBudget,
  recordUsageAndSpend,
} = require("./budget-guard");

/**
 * Identifiants des modèles Claude utilisés par Trendl.
 * Référence : https://docs.claude.com/en/docs/about-claude/models
 */
const MODEL_HAIKU = "claude-haiku-4-5-20251001";
const MODEL_SONNET = "claude-sonnet-4-6";
// Sprint 101 — modèle le plus fin, réservé à la préparation de rendez-vous et
// aux points de synthèse d'Alfred (≈ 1,7× le prix de Sonnet). Repli automatique
// sur Sonnet si le compte API ne le propose pas (cf. alfredChat).
const MODEL_OPUS = "claude-opus-4-6";

// Sprint 54 (B47) — backoff automatique contre les rafales de rate-limit.
// Le SDK Anthropic ré-essaie tout seul les erreurs 429 (rate limit) et 5xx
// (surcharge serveur) avec un backoff exponentiel + jitter, en RESPECTANT
// l'en-tête `retry-after` renvoyé par l'API. On relève le nombre d'essais
// (défaut SDK = 2) pour absorber les pics d'ingestion d'emails sans faire
// échouer l'analyse. Couplé au plafond de concurrence sur le trigger
// analyzeEmail (maxInstances), ça lisse le débit d'appels.
const ANTHROPIC_MAX_RETRIES = 6;

// Cache d'instance — 1 client par CLÉ RÉSOLUE (Sprint 82 : la clé peut
// changer si le compte exploitant est désigné/retiré ; le TTL 60 s de
// user-secrets fait foi, ici on garde une instance par clé rencontrée).
const clientsByKey = new Map();

/**
 * Retourne un client Anthropic prêt à l'emploi.
 * Initialise le client au premier appel (lecture du secret + instanciation).
 * Les appels suivants réutilisent l'instance en cache.
 *
 * @return {Promise<import("@anthropic-ai/sdk").default>} Client Anthropic
 */
async function getAnthropicClient() {
  const Anthropic = require("@anthropic-ai/sdk");
  const apiKey = await resolveSecret("ANTHROPIC_API_KEY");
  if (!clientsByKey.has(apiKey)) {
    // Sprint 102 : nettoyage des moitiés d'emoji orphelines avant tout envoi.
    clientsByKey.set(apiKey, protectAiClient(new Anthropic({
      apiKey,
      maxRetries: ANTHROPIC_MAX_RETRIES,
    })));
  }
  return clientsByKey.get(apiKey);
}

/**
 * Primitive BAS NIVEAU d'appel Claude (Sprint 65 A10, puis Sprint 67 A15).
 *
 * Garantit en un seul endroit, pour un appel NON structuré (texte libre) :
 *   1. la vérification du plafond de coût mensuel AVANT l'appel (assertWithinAiBudget) ;
 *   2. l'appel à l'API ;
 *   3. la mesure du coût + l'incrément du compteur de budget APRÈS (recordUsageAndSpend).
 *
 * Sprint 67 (A15) : les appels à SORTIE STRUCTURÉE (les 11 sites métier) ne
 * passent plus par ici mais par l'interface neutre `generateStructured`
 * (lib/ai-provider.js), qui porte les mêmes garde-fous budget/coût + la
 * validation zod, et isole le dialecte Anthropic dans un adaptateur unique.
 * Cette primitive reste disponible pour un éventuel appel libre sans schéma.
 *
 * @param {object} client Client Anthropic initialisé (getAnthropicClient()).
 * @param {object} params Paramètres passés tels quels à client.messages.create
 *   (model, max_tokens, system, tools, tool_choice, messages…).
 * @param {object} [opts]
 * @param {string} opts.fn Nom logique de l'appelant (observabilité + budget),
 *   ex. "summarizeRecord".
 * @return {Promise<object>} La réponse de l'API Anthropic.
 * @throws {Error} status 429 code "ai/budget-exceeded" si le plafond est franchi.
 */
async function callAnthropic(client, params, { fn = "unknown" } = {}) {
  await assertWithinAiBudget({ fn });
  const response = await client.messages.create(params);
  await recordUsageAndSpend(fn, params && params.model, response);
  return response;
}

module.exports = {
  getAnthropicClient,
  callAnthropic,
  MODEL_HAIKU,
  MODEL_SONNET,
  MODEL_OPUS,
  // Ré-exporté pour que les appelants importent tout depuis un seul module.
  recordAnthropicUsage,
  assertWithinAiBudget,
};
