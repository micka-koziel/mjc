/**
 * Adaptateur Anthropic — Sprint 67, Action 15 d'Alex (portabilité IA).
 *
 * C'est le SEUL endroit du code qui « parle le dialecte Anthropic natif » :
 * construction de la requête `messages.create`, choix du chemin standard vs
 * strict bêta, extraction du bloc `tool_use`. Tout le reste de l'app passe par
 * l'interface neutre `generateStructured` (lib/ai-provider.js) et ignore
 * complètement la forme d'API d'Anthropic.
 *
 * Avant le S67, cette mécanique était dupliquée ×11 (8 sites parlaient le
 * dialecte natif à la main + 3 via l'ancien `runToolCall`). Maintenant elle
 * vit ICI, une seule fois. Changer de fournisseur IA un jour = écrire un autre
 * adaptateur exposant la même fonction `generate`, sans toucher aux 11 sites.
 * Brique réutilisable pour KHentik (cf. project_khentik_next_app_framework).
 *
 * Cet adaptateur ne s'occupe QUE de la mécanique d'API. Le budget (garde-fou
 * coût), la mesure de dépense et la validation zod sont des préoccupations
 * AGNOSTIQUES du fournisseur : elles vivent dans la couche neutre au-dessus.
 *
 * FLAG : `ANTHROPIC_STRICT_OUTPUTS=true` active le mode strict natif (bêta
 * structured outputs). OFF par défaut → comportement RUNTIME IDENTIQUE à
 * l'existant (mêmes appels `messages.create`). On peut donc déployer sans
 * risque et n'activer le strict qu'en staging pour le valider, puis en prod.
 *
 * NB modèles : les structured outputs stricts sont une bêta qui ne couvre pas
 * tous les modèles (Haiku notamment). Les appels Haiku passent
 * `allowStrict: false` : même flag ON, ils restent sur le chemin standard.
 */

// En-tête bêta « structured outputs » (cf docs.claude.com/.../structured-outputs).
const STRUCTURED_OUTPUTS_BETA = "structured-outputs-2025-11-13";

// Nom logique du fournisseur — exposé pour l'observabilité / le débogage.
const PROVIDER_NAME = "anthropic";

/**
 * Le mode strict natif est-il demandé par l'environnement ?
 * @return {boolean}
 */
function strictEnabled() {
  return process.env.ANTHROPIC_STRICT_OUTPUTS === "true";
}

/**
 * Sprint 68 (Action 18 d'Alex, constat M02-R4) — PROMPT CACHING.
 *
 * Le prompt système de nos appels (ex. le triage d'e-mails) est CONSTANT d'un
 * appel à l'autre. Sans cache, on le re-paie en tokens d'entrée à CHAQUE appel.
 * Le prompt caching d'Anthropic mémorise ce préfixe côté serveur : la 1re fois
 * il est « écrit » (léger surcoût ×1,25), les suivantes il est « lu » au tarif
 * remisé (×0,10). Métaphore : au lieu de réexpliquer tout le contexte au début
 * de chaque appel, on laisse une fiche que le modèle relit pour presque rien.
 *
 * Mécanique : on transmet `system` sous forme de bloc de contenu portant
 * `cache_control: {type: "ephemeral"}` (cache 5 min). En dessous du seuil minimal
 * de tokens cacheables, Anthropic ignore simplement la directive (aucun risque).
 * Le coût (cache_read/creation) est déjà géré par observability.computeUsageCost.
 *
 * Activé par défaut (gain pur, comportement de sortie identique). Kill-switch :
 * ANTHROPIC_PROMPT_CACHING="false".
 *
 * @return {boolean}
 */
function cachingEnabled() {
  return process.env.ANTHROPIC_PROMPT_CACHING !== "false";
}

/**
 * Construit le champ `system` de la requête. Avec le caching activé et un
 * system non vide, on le passe en bloc cacheable ; sinon on garde la chaîne
 * brute (comportement historique).
 *
 * @param {string} system
 * @return {string|Array<object>}
 */
function buildSystemField(system) {
  if (!cachingEnabled() || !system) return system;
  return [
    {type: "text", text: String(system), cache_control: {type: "ephemeral"}},
  ];
}

/**
 * Appelle Anthropic pour produire une sortie STRUCTURÉE via un outil forcé,
 * et renvoie la réponse brute + la sortie extraite (sans la valider — c'est le
 * rôle de la couche neutre).
 *
 * @param {object} client Client Anthropic initialisé (getAnthropicClient()).
 * @param {object} params
 * @param {string} params.model Identifiant de modèle.
 * @param {string} params.system System prompt.
 * @param {string} params.user Contenu utilisateur (texte).
 * @param {object} params.tool Définition d'outil Anthropic (name + input_schema).
 * @param {number} params.maxTokens Plafond de tokens de sortie.
 * @param {boolean} [params.allowStrict=true] Autoriser le strict natif sur cet appel.
 * @param {Array<{mediaType: string, dataBase64: string}>} [params.documents]
 *   Sprint 71 — pièces jointes à analyser (ex. facture PDF). Traduites ici en
 *   blocs `document` du dialecte Anthropic ; le reste de l'app n'en sait rien.
 * @return {Promise<{response: object, output: object|null}>}
 *   `response` = réponse brute de l'API (pour la mesure de coût) ;
 *   `output`   = `tool_use.input` extrait, ou `null` si aucun bloc tool_use.
 */
async function generate(
  client,
  {model, system, user, tool, maxTokens, allowStrict = true, documents},
) {
  // Sprint 71 — extraction de factures : le contenu user peut embarquer des
  // documents (PDF base64). Sans document, on garde la chaîne brute
  // (comportement historique, aucun impact sur les 11 sites existants).
  let content = user;
  if (Array.isArray(documents) && documents.length > 0) {
    content = [
      ...documents.map((d) => ({
        // PDF → bloc `document` ; photo (ex. facture reçue par WhatsApp)
        // → bloc `image`. Même source base64 dans les deux dialectes.
        type: d.mediaType && d.mediaType.startsWith("image/") ?
          "image" :
          "document",
        source: {
          type: "base64",
          media_type: d.mediaType,
          data: d.dataBase64,
        },
      })),
      {type: "text", text: user},
    ];
  }

  const baseParams = {
    model,
    max_tokens: maxTokens,
    // M02-R4 — system passé en bloc cacheable si le caching est actif.
    system: buildSystemField(system),
    tool_choice: {type: "tool", name: tool.name},
    messages: [{role: "user", content}],
  };

  const useStrict = strictEnabled() && allowStrict !== false;

  let response;
  if (useStrict) {
    response = await client.beta.messages.create({
      ...baseParams,
      betas: [STRUCTURED_OUTPUTS_BETA],
      tools: [{...tool, strict: true}],
    });
  } else {
    response = await client.messages.create({
      ...baseParams,
      tools: [tool],
    });
  }

  const toolUse = (response.content || []).find((c) => c.type === "tool_use");
  const output = toolUse && toolUse.input ? toolUse.input : null;

  return {response, output};
}

/**
 * Sprint 95 — un TOUR d'agent à outils (Alfred) : le modèle répond par du
 * texte et/ou des appels d'outils. Dialecte Anthropic isolé ici : le reste de
 * l'app manipule des messages et des appels neutres ({id, name, input}).
 *
 * @param {object} client Client Anthropic
 * @param {object} params
 * @param {string} params.model
 * @param {string} params.system
 * @param {Array<object>} params.messages Messages déjà au format fournisseur
 * @param {Array<object>} params.tools Définitions {name, description, input_schema}
 * @param {number} params.maxTokens
 * @return {Promise<{response: object, text: string,
 *   toolCalls: Array<{id: string, name: string, input: object}>,
 *   assistantMessage: object}>}
 */
async function agentTurn(client, {model, system, messages, tools, maxTokens, toolChoice}) {
  // toolChoice : "auto" (défaut), "any" (un outil obligatoire) ou le NOM d'un
  // outil imposé (réponse finale forcée au dernier tour).
  const choice = !toolChoice || toolChoice === "auto" ?
    {type: "auto"} :
    toolChoice === "any" ? {type: "any"} : {type: "tool", name: toolChoice};
  const response = await client.messages.create({
    model,
    max_tokens: maxTokens,
    system: buildSystemField(system),
    tools,
    tool_choice: choice,
    messages,
  });
  const content = response.content || [];
  const text = content
      .filter((c) => c.type === "text")
      .map((c) => c.text)
      .join("\n")
      .trim();
  const toolCalls = content
      .filter((c) => c.type === "tool_use")
      .map((c) => ({id: c.id, name: c.name, input: c.input || {}}));
  return {response, text, toolCalls, assistantMessage: {role: "assistant", content}};
}

/** Message utilisateur texte, au format du fournisseur. */
function userTextMessage(text) {
  return {role: "user", content: String(text || "")};
}

/** Message assistant texte (historique), au format du fournisseur. */
function assistantTextMessage(text) {
  return {role: "assistant", content: String(text || "")};
}

/**
 * Résultats d'outils renvoyés au modèle.
 * @param {Array<{id: string, content: string, isError?: boolean}>} results
 * @return {object}
 */
function toolResultsMessage(results) {
  return {
    role: "user",
    content: results.map((r) => ({
      type: "tool_result",
      tool_use_id: r.id,
      content: r.content,
      ...(r.isError ? {is_error: true} : {}),
    })),
  };
}

module.exports = {
  agentTurn,
  userTextMessage,
  assistantTextMessage,
  toolResultsMessage,
  generate,
  strictEnabled,
  cachingEnabled,
  buildSystemField,
  STRUCTURED_OUTPUTS_BETA,
  PROVIDER_NAME,
};
