/**
 * budget-guard.js — plafond de coût IA (Sprint 65, Action 10 d'Alex :
 * « plafond de coût IA »).
 *
 * Pourquoi ce module (constat Alex, ch. 4) :
 *   Le socle d'observabilité (lib/observability.js, S57) MESURE déjà le coût de
 *   chaque appel Claude et alerte via Cloud Monitoring. Mais rien ne COUPE : une
 *   boucle qui rappellerait l'IA en rafale ferait gonfler la facture sans frein.
 *   Ce module ajoute le garde-fou manquant : il tient un compteur de dépense
 *   mensuelle et REFUSE un nouvel appel IA dès qu'un plafond est franchi.
 *
 * Angle framework : même philosophie que retention.js (S64).
 *   - La DÉCISION est pure (classifyBudget) → testable sans Firestore.
 *   - L'I/O (lecture du compteur, incrément) est séparée et injectable.
 *   - DOUBLE VERROU, livré ÉTEINT : variable d'env AI_BUDGET_ENABLED="true" ET
 *     un plafond AI_BUDGET_CAP_USD défini. Tant que les deux ne sont pas posés,
 *     le garde-fou est INERTE (aucun appel n'est bloqué, aucune lecture
 *     Firestore supplémentaire). On peut donc déployer sans aucun risque, puis
 *     l'armer en staging, puis en prod.
 *
 * Toute future app qui appelle un LLM réutilise ce module tel quel.
 */

const { currentPeriod, recordAnthropicUsage } = require("./observability");

// ---------------------------------------------------------------------------
// Configuration par variables d'environnement (mêmes conventions que
// retention.js : on lit process.env, injectable en test).
// ---------------------------------------------------------------------------

/** Verrou global : tant que != "true", le garde-fou est totalement inerte. */
const BUDGET_ENABLED_ENV = "AI_BUDGET_ENABLED";
/** Plafond mensuel en USD (nombre). Sans valeur > 0, aucun blocage possible. */
const BUDGET_CAP_ENV = "AI_BUDGET_CAP_USD";
/**
 * Ratio à partir duquel on ALERTE avant de couper (défaut 0,8 = 80 %).
 * Permet de prévenir « on approche du plafond » sans encore bloquer.
 */
const BUDGET_SOFT_RATIO_ENV = "AI_BUDGET_SOFT_RATIO";
const DEFAULT_SOFT_RATIO = 0.8;

/**
 * Construit le chemin du doc compteur pour une période donnée. Un doc par mois,
 * rangé sous `system/` (déjà admin-read + write serveur only dans firestore.rules,
 * donc protégé sans nouvelle règle, et observable par un badge UI).
 *
 * @param {string} period Période "AAAA-MM"
 * @return {string} Chemin du document Firestore
 */
function budgetDocPath(period) {
  return `system/ai-budget-${period}`;
}

/**
 * Lit la configuration de budget depuis l'environnement. Fonction pure.
 *
 * @param {object} [env=process.env]
 * @return {{enabled:boolean, capUsd:(number|null), softRatio:number}}
 */
function resolveBudgetConfig(env = process.env) {
  const enabled = String(env[BUDGET_ENABLED_ENV]) === "true";

  const rawCap = Number(env[BUDGET_CAP_ENV]);
  const capUsd = Number.isFinite(rawCap) && rawCap > 0 ? rawCap : null;

  const rawRatio = Number(env[BUDGET_SOFT_RATIO_ENV]);
  const softRatio =
    Number.isFinite(rawRatio) && rawRatio > 0 && rawRatio <= 1
      ? rawRatio
      : DEFAULT_SOFT_RATIO;

  return { enabled, capUsd, softRatio };
}

/**
 * Décide de l'état du budget à partir de la dépense courante. Fonction PURE.
 *
 * Statuts :
 *   - "block" : la dépense atteint ou dépasse le plafond → on refuse l'appel.
 *   - "warn"  : la dépense atteint le seuil d'alerte (softRatio × plafond) mais
 *               pas encore le plafond → on laisse passer en journalisant.
 *   - "ok"    : sous le seuil d'alerte (ou aucun plafond défini).
 *
 * @param {object} args
 * @param {number} args.spentUsd Dépense déjà engagée sur la période (USD)
 * @param {number|null} args.capUsd Plafond mensuel (USD) ou null si non défini
 * @param {number} [args.softRatio=0.8] Ratio du seuil d'alerte
 * @return {{status:"ok"|"warn"|"block", ratio:number, capUsd:(number|null)}}
 */
function classifyBudget({ spentUsd, capUsd, softRatio = DEFAULT_SOFT_RATIO }) {
  const spent = Number(spentUsd) || 0;

  // Pas de plafond exploitable → on ne peut jamais bloquer.
  if (!capUsd || capUsd <= 0) {
    return { status: "ok", ratio: 0, capUsd: null };
  }

  const ratio = spent / capUsd;

  if (spent >= capUsd) {
    return { status: "block", ratio, capUsd };
  }
  if (spent >= capUsd * softRatio) {
    return { status: "warn", ratio, capUsd };
  }
  return { status: "ok", ratio, capUsd };
}

/**
 * Logger Firebase chargé en LAZY (cf observability.js) : les fonctions pures
 * ci-dessus restent importables sans charger firebase-functions (tests).
 *
 * @return {import("firebase-functions").logger}
 */
function getLogger() {
  return require("firebase-functions").logger;
}

/**
 * Récupère la base Firestore par défaut (lazy require pour ne pas charger
 * firebase-admin dans les tests des fonctions pures).
 *
 * @return {{db:object, admin:object}}
 */
function getDefaultDb() {
  return require("./firebase-admin");
}

/**
 * Lit la dépense IA déjà engagée sur une période. I/O.
 *
 * @param {string} period Période "AAAA-MM"
 * @param {object} [deps]
 * @param {object} [deps.db] Base Firestore injectable
 * @return {Promise<number>} Dépense en USD (0 si doc absent)
 */
async function readAiSpend(period, deps = {}) {
  const database = deps.db || getDefaultDb().db;
  const snap = await database.doc(budgetDocPath(period)).get();
  if (!snap.exists) return 0;
  const data = snap.data() || {};
  return Number(data.spent_usd) || 0;
}

/**
 * Incrémente atomiquement le compteur de dépense IA de la période. I/O.
 * Ne throw JAMAIS : un échec de comptabilité ne doit pas casser un appel IA qui,
 * lui, a réussi (même contrat que recordAnthropicUsage).
 *
 * @param {object} args
 * @param {string} args.fn Nom logique de l'appelant (pour les logs)
 * @param {string} args.period Période "AAAA-MM"
 * @param {number} args.costUsd Coût de l'appel à ajouter (USD)
 * @param {object} [args.db] Base injectable
 * @param {object} [args.adminSdk] SDK admin injectable (pour FieldValue)
 * @return {Promise<void>}
 */
async function recordAiSpend({ fn, period, costUsd, db: injDb, adminSdk }) {
  const cost = Number(costUsd) || 0;
  if (cost <= 0) return; // rien à compter (appel non tarifé ou gratuit)

  try {
    const fallback = getDefaultDb();
    const database = injDb || fallback.db;
    const sdk = adminSdk || fallback.admin;
    await database.doc(budgetDocPath(period)).set(
      {
        period,
        spent_usd: sdk.firestore.FieldValue.increment(cost),
        last_updated_at: sdk.firestore.FieldValue.serverTimestamp(),
      },
      { merge: true },
    );
  } catch (err) {
    getLogger().error("recordAiSpend — échec incrément (non bloquant)", {
      fn,
      period,
      error: err && err.message,
    });
  }
}

/**
 * Sprint 81 (réunion 20/07) — COMPTEUR DE CONSOMMATION IA.
 *
 * Max : « Est-ce que t'as un truc quelque part sur le suivi des token, la
 * dépense et ce que ça nous coûte ? ». Le log S57 (Cloud Monitoring) mesure
 * déjà chaque appel, mais n'est pas consultable dans l'app. On tient donc,
 * dans le doc mensuel `system/ai-budget-{AAAA-MM}` (admin-read), des
 * agrégats TOUJOURS alimentés (contrairement à `spent_usd` qui reste le
 * compteur du garde-fou, tenu seulement quand il est armé) :
 *   usage_cost_usd, usage_calls, usage_input_tokens, usage_output_tokens,
 *   usage_cache_read_tokens, usage_cache_creation_tokens,
 *   usage_by_fn.{fn}: {calls, cost_usd, input_tokens, output_tokens}.
 * Consommé par la console /admin/system/consommation-ia.
 * Ne throw JAMAIS (même contrat que recordAiSpend).
 *
 * @param {object} args
 * @param {string} args.fn Nom logique de l'appelant
 * @param {string} args.period Période "AAAA-MM"
 * @param {object} args.detail Détail costé de recordAnthropicUsage
 * @param {object} [args.db] Base injectable
 * @param {object} [args.adminSdk] SDK admin injectable (pour FieldValue)
 * @return {Promise<void>}
 */
async function recordAiUsageStats({ fn, period, detail, db: injDb, adminSdk }) {
  if (!detail) return;
  try {
    const fallback = getDefaultDb();
    const database = injDb || fallback.db;
    const sdk = adminSdk || fallback.admin;
    const inc = (n) => sdk.firestore.FieldValue.increment(Number(n) || 0);
    const cost = detail.priced ? Number(detail.costUsd) || 0 : 0;
    // Clé de map sûre (pas de séparateur de chemin Firestore).
    const fnKey = String(fn || "inconnu").replace(/[~*/[\].]/g, "_").slice(0, 60);
    await database.doc(budgetDocPath(period)).set(
      {
        period,
        usage_calls: inc(1),
        usage_cost_usd: inc(cost),
        usage_input_tokens: inc(detail.inputTokens),
        usage_output_tokens: inc(detail.outputTokens),
        usage_cache_read_tokens: inc(detail.cacheReadTokens),
        usage_cache_creation_tokens: inc(detail.cacheCreationTokens),
        usage_by_fn: {
          [fnKey]: {
            calls: inc(1),
            cost_usd: inc(cost),
            input_tokens: inc(detail.inputTokens),
            output_tokens: inc(detail.outputTokens),
          },
        },
        usage_last_updated_at: sdk.firestore.FieldValue.serverTimestamp(),
      },
      { merge: true },
    );
  } catch (err) {
    getLogger().error("recordAiUsageStats — échec incrément (non bloquant)", {
      fn,
      period,
      error: err && err.message,
    });
  }
}

/**
 * GARDE-FOU : à appeler AVANT chaque appel IA. Vérifie que la dépense mensuelle
 * n'a pas franchi le plafond.
 *
 * Comportement (double verrou) :
 *   - Garde-fou désarmé (env OFF) → retourne { status:"disabled" } sans aucune
 *     lecture Firestore. Coût nul, comportement identique à l'existant.
 *   - Armé + dépense < seuil d'alerte → { status:"ok" }.
 *   - Armé + dépense >= seuil d'alerte → log d'ALERTE, { status:"warn" }, on
 *     laisse passer (on prévient avant de couper).
 *   - Armé + dépense >= plafond → log d'ALERTE + THROW (l'appel IA est refusé).
 *
 * @param {object} [args]
 * @param {string} [args.fn] Nom logique de l'appelant (logs)
 * @param {number} [args.now=Date.now()] Instant de référence (injectable test)
 * @param {object} [args.db] Base injectable
 * @param {object} [args.env=process.env] Environnement injectable
 * @return {Promise<{status:string, spentUsd?:number, capUsd?:(number|null), ratio?:number, period?:string}>}
 * @throws {Error} status 429, code "ai/budget-exceeded" si le plafond est franchi
 */
async function assertWithinAiBudget({
  fn = "unknown",
  now = Date.now(),
  db: injDb,
  env = process.env,
  // Sprint 106 — test `budget-guard` instable : le premier chargement de
  // firebase-functions (logger) dépassait parfois le délai de 5 s du test.
  // Un logger injecté évite ce chargement lourd dans les tests.
  logger: injLogger = null,
} = {}) {
  const config = resolveBudgetConfig(env);
  const log = () => injLogger || getLogger();

  // Verrou global OFF → inerte (pas de lecture Firestore, zéro surcoût).
  if (!config.enabled) {
    return { status: "disabled" };
  }

  const period = currentPeriod(now);
  const spentUsd = await readAiSpend(period, { db: injDb });
  const verdict = classifyBudget({
    spentUsd,
    capUsd: config.capUsd,
    softRatio: config.softRatio,
  });

  const payload = {
    metric: "ai_budget",
    fn,
    period,
    spent_usd: spentUsd,
    cap_usd: verdict.capUsd,
    ratio: Math.round(verdict.ratio * 1000) / 1000,
    status: verdict.status,
  };

  if (verdict.status === "block") {
    log().error("ai_budget — plafond atteint, appel IA refusé", {
      ...payload,
      alert: "ai_budget_exceeded",
    });
    const err = new Error(
      `Plafond de coût IA atteint pour ${period} ` +
        `(${spentUsd.toFixed(2)} / ${verdict.capUsd} USD). Appel IA refusé.`,
    );
    err.status = 429;
    err.code = "ai/budget-exceeded";
    throw err;
  }

  if (verdict.status === "warn") {
    log().warn("ai_budget — seuil d'alerte franchi", {
      ...payload,
      alert: "ai_budget_warning",
    });
  }

  return { status: verdict.status, spentUsd, capUsd: verdict.capUsd, ratio: verdict.ratio, period };
}

/**
 * Comptabilise un appel IA terminé : émet le log d'observabilité de coût (S57)
 * PUIS incrémente le compteur de budget mensuel. À appeler juste après la
 * réponse de l'API, à la place de `recordAnthropicUsage`.
 *
 * Ne throw JAMAIS (les deux étapes sont non bloquantes).
 *
 * @param {string} fn Nom logique de l'appelant
 * @param {string} model Identifiant de modèle
 * @param {object} response Réponse de l'API Anthropic (porte `.usage`)
 * @param {object} [deps]
 * @param {number} [deps.now=Date.now()] Instant de référence
 * @param {object} [deps.db] Base injectable
 * @return {Promise<object|null>} Le détail costé (utile en test), ou null.
 */
async function recordUsageAndSpend(fn, model, response, deps = {}) {
  // L'observabilité du coût (log S57 → Cloud Monitoring) tourne TOUJOURS.
  const detail = recordAnthropicUsage(fn, model, response);

  // Sprint 81 — le COMPTEUR de consommation (tokens + coût, console
  // /admin/system/consommation-ia) est lui aussi TOUJOURS tenu : c'est une
  // feature demandée par Max (réunion 20/07), pas un garde-fou.
  if (detail) {
    const period = currentPeriod(deps.now || Date.now());
    await recordAiUsageStats({
      fn,
      period,
      detail,
      db: deps.db,
      adminSdk: deps.adminSdk,
    });
  }

  // Le compteur Firestore du plafond, lui, n'est tenu que lorsque le garde-fou
  // est ARMÉ : feature éteinte = aucune écriture supplémentaire (principe
  // « livré éteint = inerte »). Quand on l'arme, le compteur démarre du mois en
  // cours, ce qui suffit (plafond mensuel).
  const { enabled } = resolveBudgetConfig(deps.env || process.env);
  if (enabled && detail && detail.priced && detail.costUsd > 0) {
    const period = currentPeriod(deps.now || Date.now());
    await recordAiSpend({ fn, period, costUsd: detail.costUsd, db: deps.db });
  }
  return detail;
}

module.exports = {
  BUDGET_ENABLED_ENV,
  BUDGET_CAP_ENV,
  BUDGET_SOFT_RATIO_ENV,
  DEFAULT_SOFT_RATIO,
  budgetDocPath,
  resolveBudgetConfig,
  classifyBudget,
  readAiSpend,
  recordAiSpend,
  recordAiUsageStats,
  assertWithinAiBudget,
  recordUsageAndSpend,
};
