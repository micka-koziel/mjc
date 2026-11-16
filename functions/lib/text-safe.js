/**
 * text-safe — Sprint 102 (bug GamsGo / Jimtek du 20/10).
 *
 * Constat : avant d'envoyer un fil d'e-mails à l'IA, plusieurs appelants le
 * raccourcissent avec `.slice(0, N)`. En JavaScript, un emoji est stocké en
 * deux « moitiés » (paire de substitution). Si la coupe tombe entre les deux,
 * il reste une moitié orpheline : l'API Anthropic refuse alors TOUTE la
 * requête (HTTP 400 « The request body is not valid JSON: unexpected end of
 * hex escape »), et « Réessayer » rejoue la même coupe à l'infini.
 *
 * Correctif en un seul endroit (FW-1, une seule porte) : toute requête vers
 * l'IA est nettoyée juste avant l'envoi — chaque moitié orpheline devient le
 * caractère de remplacement « � ». Le reste du texte est intact.
 */

/**
 * Rend une chaîne « bien formée » (aucune moitié d'emoji orpheline).
 * @param {string} s
 * @return {string}
 */
function wellFormed(s) {
  if (typeof s !== "string") return s;
  if (typeof s.toWellFormed === "function") return s.toWellFormed();
  return s.replace(/[\uD800-\uDBFF](?![\uDC00-\uDFFF])|(?<![\uD800-\uDBFF])[\uDC00-\uDFFF]/g, "�");
}

/**
 * Coupe une chaîne à `max` unités sans jamais couper un emoji en deux.
 * @param {string} s
 * @param {number} max
 * @return {string}
 */
function safeSlice(s, max) {
  if (typeof s !== "string" || s.length <= max) return s;
  let end = max;
  const code = s.charCodeAt(end - 1);
  if (code >= 0xD800 && code <= 0xDBFF) end -= 1;
  return s.slice(0, end);
}

/**
 * Nettoie récursivement un objet de requête (chaînes, tableaux, objets
 * simples). Les autres valeurs (nombres, Buffer, etc.) sont laissées telles
 * quelles. Ne modifie pas l'objet d'origine.
 * @param {*} value
 * @param {number} [depth]
 * @return {*}
 */
function wellFormedDeep(value, depth = 0) {
  if (depth > 40) return value;
  if (typeof value === "string") return wellFormed(value);
  if (Array.isArray(value)) return value.map((v) => wellFormedDeep(v, depth + 1));
  if (value && typeof value === "object" && Object.getPrototypeOf(value) === Object.prototype) {
    const out = {};
    for (const [k, v] of Object.entries(value)) out[k] = wellFormedDeep(v, depth + 1);
    return out;
  }
  return value;
}

/**
 * Branche le nettoyage sur `messages.create` (et `beta.messages.create`)
 * d'un client Anthropic. Idempotent : un client déjà protégé n'est pas
 * rebranché.
 * @param {object} client
 * @return {object} le même client
 */
function protectAiClient(client) {
  if (!client || client.__textSafe) return client;
  const wrap = (resource) => {
    if (!resource || typeof resource.create !== "function") return;
    const original = resource.create.bind(resource);
    resource.create = (params, options) => original(wellFormedDeep(params), options);
  };
  wrap(client.messages);
  if (client.beta) wrap(client.beta.messages);
  Object.defineProperty(client, "__textSafe", {value: true});
  return client;
}

const CREDIT_MESSAGE = "Crédit IA épuisé : l'IA est en pause. Rechargez le compte Anthropic " +
  "(console.anthropic.com → Plans & Billing), puis réessayez. En attendant, rédigez à la main.";

/**
 * Le fournisseur IA refuse faute de crédit ? (texte de l'erreur Anthropic)
 * @param {Error} err
 * @return {boolean}
 */
function isCreditExhausted(err) {
  if (!err) return false;
  const inner = err.error && err.error.error && err.error.error.message;
  const text = `${err.message || ""} ${inner || ""}`;
  return /credit balance is too low|purchase credits|insufficient[_ ]credit|billing/i.test(text);
}

/**
 * Erreur venue du fournisseur IA (SDK Anthropic : statut HTTP + corps
 * d'erreur), par opposition à une erreur métier de nos fonctions.
 * @param {Error} err
 * @return {boolean}
 */
function isAiProviderError(err) {
  if (!err || typeof err.status !== "number") return false;
  return Boolean(err.error && typeof err.error === "object") || /^\d{3} \{/.test(String(err.message || ""));
}

/**
 * Sprint 104.1 — réponse d'erreur des écrans IA : message lisible si
 * l'erreur vient du fournisseur IA (crédit épuisé, surcharge…), sinon le
 * message habituel de la fonction.
 * @param {Error} err
 * @param {string} [fallback] message à défaut (sinon err.message)
 * @return {{status: number, body: {error: string, code?: string}}}
 */
function aiErrorResponse(err, fallback) {
  if (isCreditExhausted(err) || isAiProviderError(err)) {
    const pub = publicAiError(err);
    return {status: pub.status, body: {error: pub.error, ...(pub.code ? {code: pub.code} : {})}};
  }
  return {status: (err && Number(err.status)) || 500, body: {error: fallback || (err && err.message) || "Action impossible pour le moment."}};
}

/**
 * Message lisible pour l'interface quand un appel IA échoue : on n'expose
 * jamais la réponse brute du fournisseur.
 * @param {Error} err
 * @return {{status: number, error: string}}
 */
function publicAiError(err) {
  const status = Number(err && err.status) || 500;
  // Sprint 104.1 (panne du 29/10) — crédit Anthropic épuisé : Anthropic
  // répond « 400 invalid_request_error » et l'écran disait « l'IA n'a pas pu
  // lire ce fil » (fausse piste). On dit maintenant quoi faire.
  if (isCreditExhausted(err)) {
    return {status: 503, code: "ai_credit_exhausted", error: CREDIT_MESSAGE};
  }
  if (status === 429) {
    return {status, error: (err && err.message) || "Plafond IA atteint, réessayez plus tard."};
  }
  if (status === 400) {
    return {status: 502, error: "L'IA n'a pas pu lire ce fil d'e-mails. Réessayez, ou rédigez la réponse à la main."};
  }
  if (status === 529 || status === 503 || status === 502) {
    return {status: 503, error: "L'IA est momentanément surchargée. Réessayez dans une minute."};
  }
  return {status: 500, error: "La génération a échoué. Réessayez, ou rédigez la réponse à la main."};
}

module.exports = {wellFormed, safeSlice, wellFormedDeep, protectAiClient, publicAiError, isCreditExhausted, isAiProviderError, aiErrorResponse};
