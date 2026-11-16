/**
 * observability.js — socle de mesure du coût IA (Sprint 57, Action 1 d'Alex).
 *
 * Pourquoi ce module (constat Alex M07-R1 « cécité ») :
 *   Jusqu'ici, chaque appel à Claude jetait `response.usage` à la poubelle.
 *   On ne savait pas combien de tokens — donc combien d'euros — chaque
 *   fonction consommait. Ce module lit l'usage renvoyé par l'API, calcule un
 *   coût estimé, et émet une ligne de LOG STRUCTURÉ `ai_usage`. Cette ligne est
 *   ensuite captée par une métrique Cloud Monitoring (PR3) qui déclenche une
 *   alerte si le coût mensuel dépasse un seuil.
 *
 * Angle framework : ce module est volontairement agnostique du projet. Toute
 *   future app qui appelle un LLM peut le réutiliser tel quel pour avoir sa
 *   mesure de coût « dès le jour 1 ».
 *
 * Découpage volontaire :
 *   - computeUsageCost(model, usage) : fonction PURE (aucun I/O) → testable.
 *   - recordAnthropicUsage(fn, model, response) : émet le log (effet de bord).
 *     Ne throw JAMAIS : l'observabilité ne doit pas casser le chemin métier.
 */

/**
 * Logger Firebase chargé en LAZY : seules les fonctions d'émission de log en ont
 * besoin. Les fonctions de calcul pures (computeUsageCost, estimateTavilyCredits)
 * restent ainsi importables sans charger firebase-functions — important pour les
 * tests unitaires et pour les modules (ex. tavily-client) qui importent ce
 * fichier sans forcément tourner dans le runtime Functions.
 *
 * @return {import("firebase-functions").logger} Le logger Firebase
 */
function getLogger() {
  return require("firebase-functions").logger;
}

/**
 * Table de prix Claude, en USD par MILLION de tokens.
 * Source : page de tarifs officielle Anthropic — vérifiée le 2026-06-26.
 *   https://docs.claude.com/en/docs/about-claude/pricing
 *
 * Multiplicateurs de cache standard Anthropic :
 *   - écriture cache 5 min = 1,25 × prix d'entrée
 *   - lecture cache         = 0,10 × prix d'entrée
 *
 * ⚠️ À mettre à jour si les tarifs changent ou si un nouveau modèle est
 * introduit. La clé est la FAMILLE du modèle (sans suffixe de date) : un id
 * versionné comme « claude-haiku-4-5-20251001 » est résolu par préfixe.
 */
const PRICING_PER_MTOK = {
  "claude-haiku-4-5": {
    input: 1,
    output: 5,
    cacheWrite5m: 1.25,
    cacheRead: 0.1,
  },
  "claude-sonnet-4-6": {
    input: 3,
    output: 15,
    cacheWrite5m: 3.75,
    cacheRead: 0.3,
  },
  // Sprint 101 — Alfred, préparation de rendez-vous (pickAlfredModel « deep »).
  "claude-opus-4-6": {
    input: 5,
    output: 25,
    cacheWrite5m: 6.25,
    cacheRead: 0.5,
  },
};

const MTOK = 1_000_000;

/**
 * Retourne la PÉRIODE mensuelle "AAAA-MM" (UTC) d'un instant donné. Fonction
 * pure — sert de clé d'agrégation pour les compteurs de coût (budget IA,
 * crédits Tavily). UTC volontaire : indépendant du fuseau de la machine, stable
 * d'une instance Cloud Function à l'autre.
 *
 * @param {number|Date} [now=Date.now()] Instant de référence
 * @return {string} Période "AAAA-MM"
 */
function currentPeriod(now = Date.now()) {
  const d = now instanceof Date ? now : new Date(now);
  const year = d.getUTCFullYear();
  const month = String(d.getUTCMonth() + 1).padStart(2, "0");
  return `${year}-${month}`;
}

/**
 * Résout la grille tarifaire d'un modèle.
 * Essaie d'abord une correspondance exacte, puis par préfixe de famille
 * (pour absorber les suffixes de date type « -20251001 »).
 *
 * @param {string} model Identifiant de modèle (ex. "claude-sonnet-4-6")
 * @return {{input:number, output:number, cacheWrite5m:number, cacheRead:number}|null}
 */
function resolvePricing(model) {
  if (!model || typeof model !== "string") {
    return null;
  }
  if (PRICING_PER_MTOK[model]) {
    return PRICING_PER_MTOK[model];
  }
  const family = Object.keys(PRICING_PER_MTOK).find((key) =>
    model.startsWith(key),
  );
  return family ? PRICING_PER_MTOK[family] : null;
}

/**
 * Calcule le coût estimé d'un appel IA à partir de l'objet `usage` renvoyé
 * par l'API Anthropic. Fonction PURE, sans effet de bord.
 *
 * L'objet `usage` Anthropic contient :
 *   - input_tokens                 : tokens d'entrée facturés au prix plein
 *   - output_tokens                : tokens de sortie
 *   - cache_read_input_tokens      : tokens lus depuis le cache (remisés)
 *   - cache_creation_input_tokens  : tokens écrits dans le cache (majorés)
 * Les champs de cache sont optionnels (absents si le prompt caching n'est pas
 * utilisé) : on les traite comme 0 par défaut.
 *
 * @param {string} model Identifiant de modèle
 * @param {object} usage Objet `response.usage` de l'API Anthropic
 * @return {{model:string, priced:boolean, inputTokens:number, outputTokens:number,
 *           cacheReadTokens:number, cacheCreationTokens:number, costUsd:number}}
 */
function computeUsageCost(model, usage) {
  const u = usage || {};
  const inputTokens = u.input_tokens || 0;
  const outputTokens = u.output_tokens || 0;
  const cacheReadTokens = u.cache_read_input_tokens || 0;
  const cacheCreationTokens = u.cache_creation_input_tokens || 0;

  const pricing = resolvePricing(model);

  if (!pricing) {
    // Modèle inconnu : on ne sait pas le coster. On renvoie priced:false
    // (et recordAnthropicUsage logguera un warning pour penser à mettre à
    // jour la table) plutôt que d'inventer un chiffre faux.
    return {
      model: model || null,
      priced: false,
      inputTokens,
      outputTokens,
      cacheReadTokens,
      cacheCreationTokens,
      costUsd: 0,
    };
  }

  const costUsd =
    (inputTokens / MTOK) * pricing.input +
    (outputTokens / MTOK) * pricing.output +
    (cacheReadTokens / MTOK) * pricing.cacheRead +
    (cacheCreationTokens / MTOK) * pricing.cacheWrite5m;

  return {
    model,
    priced: true,
    inputTokens,
    outputTokens,
    cacheReadTokens,
    cacheCreationTokens,
    // Arrondi à 6 décimales : un appel coûte souvent une fraction de centime.
    costUsd: Math.round(costUsd * 1e6) / 1e6,
  };
}

/**
 * Émet une ligne de log structuré `ai_usage` pour un appel IA terminé.
 * À appeler juste après `client.messages.create(...)`.
 *
 * Le payload est plat et stable pour qu'une métrique Cloud Monitoring
 * (PR3) puisse filtrer sur `metric="ai_usage"` et agréger `cost_usd`.
 *
 * Ne throw JAMAIS : un souci de mesure ne doit pas faire échouer l'appel
 * métier qui, lui, a réussi.
 *
 * @param {string} fn Nom logique de l'appelant (ex. "analyzeEmail.classify")
 * @param {string} model Identifiant de modèle utilisé
 * @param {object} response Réponse de l'API Anthropic (doit porter `.usage`)
 * @return {object|null} Le détail costé (utile en test), ou null si erreur.
 */
function recordAnthropicUsage(fn, model, response) {
  const logger = getLogger();
  try {
    const detail = computeUsageCost(model, response && response.usage);

    const payload = {
      metric: "ai_usage",
      fn,
      model: detail.model,
      priced: detail.priced,
      input_tokens: detail.inputTokens,
      output_tokens: detail.outputTokens,
      cache_read_tokens: detail.cacheReadTokens,
      cache_creation_tokens: detail.cacheCreationTokens,
      cost_usd: detail.costUsd,
    };

    if (!detail.priced) {
      logger.warn(
        "ai_usage — modèle non tarifé (table à mettre à jour)",
        payload,
      );
    } else {
      logger.info("ai_usage", payload);
    }

    return detail;
  } catch (err) {
    // On loggue l'incident d'observabilité mais on ne propage pas l'erreur.
    logger.error("recordAnthropicUsage — échec mesure (non bloquant)", {
      fn,
      model,
      error: err && err.message,
    });
    return null;
  }
}

// ---------------------------------------------------------------------------
// Tavily — mesure d'usage en CRÉDITS (Sprint 57, reco §14.2 de la revue d'archi
// remise à Alex : « alerte de budget Anthropic / Tavily / Cloud + seuil sur le
// compteur Tavily »). Contrairement à l'IA, Tavily ne facture pas au token mais
// en CRÉDITS d'API, avec un quota gratuit de 1000 crédits / mois. Ce qui compte
// pour l'alerte est donc le NOMBRE DE CRÉDITS consommés, pas un coût en $.
//
// Barème de crédits Tavily — vérifié le 2026-06-26 (https://docs.tavily.com).
// ⚠️ À mettre à jour si Tavily change sa grille.
//   - Recherche  : 1 crédit (basic) / 2 crédits (advanced)
//   - Extraction : 1 crédit (basic) / 2 crédits (advanced) PAR TRANCHE DE 5 URLs
// ---------------------------------------------------------------------------

const TAVILY_FREE_MONTHLY_CREDITS = 1000;

/**
 * Estime le nombre de crédits Tavily consommés par un appel. Fonction PURE.
 *
 * @param {object} call
 * @param {"search"|"extract"} call.endpoint Endpoint Tavily appelé
 * @param {"basic"|"advanced"} [call.depth="basic"] Profondeur de la requête
 * @param {number} [call.urlCount=0] Nb d'URLs (extract uniquement)
 * @return {number} Crédits estimés (entier ≥ 0)
 */
function estimateTavilyCredits({ endpoint, depth = "basic", urlCount = 0 }) {
  const perUnit = depth === "advanced" ? 2 : 1;
  if (endpoint === "extract") {
    if (urlCount <= 0) return 0;
    // Facturation par tranche de 5 URLs (arrondi au supérieur).
    return Math.ceil(urlCount / 5) * perUnit;
  }
  // endpoint "search" (ou défaut) : 1 appel = 1 unité.
  return perUnit;
}

/**
 * Émet une ligne de log structuré `tavily_usage` pour un appel Tavily terminé.
 * Payload plat et stable, capté par une métrique Cloud Monitoring (PR3) qui
 * alerte sur le dépassement d'un seuil mensuel de crédits.
 *
 * Ne throw JAMAIS : l'observabilité ne casse pas le chemin métier.
 *
 * @param {string} fn Nom logique de l'appelant (ex. "searchBrandNews")
 * @param {object} call Voir estimateTavilyCredits
 * @return {{credits:number}|null} Crédits comptés (utile en test), ou null.
 */
function recordTavilyUsage(fn, call) {
  const logger = getLogger();
  try {
    const credits = estimateTavilyCredits(call || {});
    logger.info("tavily_usage", {
      metric: "tavily_usage",
      fn,
      endpoint: (call && call.endpoint) || null,
      depth: (call && call.depth) || "basic",
      url_count: (call && call.urlCount) || 0,
      credits,
      free_monthly_credits: TAVILY_FREE_MONTHLY_CREDITS,
    });
    return { credits };
  } catch (err) {
    logger.error("recordTavilyUsage — échec mesure (non bloquant)", {
      fn,
      error: err && err.message,
    });
    return null;
  }
}

module.exports = {
  PRICING_PER_MTOK,
  resolvePricing,
  computeUsageCost,
  currentPeriod,
  recordAnthropicUsage,
  TAVILY_FREE_MONTHLY_CREDITS,
  estimateTavilyCredits,
  recordTavilyUsage,
};
