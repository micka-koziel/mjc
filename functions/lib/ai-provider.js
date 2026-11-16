/**
 * Interface IA NEUTRE — Sprint 67, Action 15 d'Alex (portabilité IA).
 *
 * `generateStructured({system, user, schema, ...})` est le point d'entrée
 * UNIQUE de tout appel IA à sortie structurée dans Trendl. Les 11 sites
 * d'appel le consomment et ne connaissent plus rien de la forme d'API du
 * fournisseur (messages.create, tool_use, en-têtes bêta…). Cette mécanique est
 * isolée dans un ADAPTATEUR (lib/ai-providers/anthropic.js).
 *
 * La couche neutre porte les préoccupations AGNOSTIQUES du fournisseur, dans
 * l'ordre :
 *   1. garde-fou budget IA AVANT l'appel (assertWithinAiBudget, A10/S65) ;
 *   2. délégation à l'adaptateur (la seule étape spécifique au fournisseur) ;
 *   3. mesure du coût + incrément du compteur de budget APRÈS (recordUsageAndSpend) ;
 *   4. barrière déterministe zod sur la sortie (validateAiOutput, A7/S61) —
 *      toute sortie hors schéma est rejetée AVANT d'être consommée (test d'Alex).
 *
 * Résultat : un nouvel appel IA hérite « gratuitement » du budget, de
 * l'observabilité de coût ET de la validation, simplement en passant par ici.
 * Et changer de fournisseur un jour ne touche QUE l'adaptateur.
 *
 * Voir feedback_pattern_budget_guard_goulot_ia (le goulot coût reste respecté)
 * et project_khentik_next_app_framework (brique IA réutilisable).
 */

const {
  assertWithinAiBudget,
  recordUsageAndSpend,
} = require("./budget-guard");
const {validateAiOutput} = require("./validation/ai-schemas");
const {fenceUntrusted, hardenSystemPrompt} = require("./prompt-safety");
const anthropicAdapter = require("./ai-providers/anthropic");

// Adaptateur actif. Un seul fournisseur aujourd'hui (Anthropic). Pour en
// ajouter un autre : implémenter `generate(client, {...}) → {response, output}`
// et le sélectionner ici (ou via une variable d'environnement).
const adapter = anthropicAdapter;

/**
 * Produit une sortie IA structurée et VALIDÉE, fournisseur-agnostique.
 *
 * @param {object} client Client IA initialisé (getAnthropicClient()).
 * @param {object} params
 * @param {string} params.model Identifiant de modèle.
 * @param {string} params.system System prompt.
 * @param {string} params.user Contenu utilisateur (texte).
 * @param {object} params.tool Définition d'outil/sortie (name + input_schema).
 * @param {import("zod").ZodTypeAny} params.schema Schéma zod de la sortie.
 * @param {number} params.maxTokens Plafond de tokens de sortie.
 * @param {string} params.label Libellé pour erreurs/logs (ex. "analyzeEmail.parse").
 * @param {string} [params.usageLabel] Libellé d'observabilité coût/budget
 *   (défaut = label).
 * @param {boolean} [params.allowStrict=true] Autoriser le strict natif si dispo.
 * @param {boolean} [params.untrusted=true] Le contenu `user` provient-il d'une
 *   source non fiable (e-mail, page web, saisie tierce) ? Si oui (défaut), il
 *   est encadré <untrusted_data> et le system durci d'une consigne anti-injection
 *   (M02-R6). Passer `false` UNIQUEMENT si `user` est un contenu maîtrisé.
 * @param {Array<{mediaType: string, dataBase64: string}>} [params.documents]
 *   Sprint 71 — documents à analyser (ex. facture PDF uploadée). Transmis tels
 *   quels à l'adaptateur, qui les traduit dans le dialecte du fournisseur. Un
 *   document uploadé est par nature NON MAÎTRISÉ : laisser `untrusted=true`
 *   (le durcissement anti-injection du system s'applique aussi à son contenu).
 * @param {object} [deps] Dépendances injectables (testabilité). Par défaut, les
 *   implémentations réelles. Permet aux tests de fournir des espions sans
 *   dépendre de l'interception de `require` par le runner de test.
 * @return {Promise<object>} Sortie IA validée (objet conforme au schéma).
 * @throws {Error} 429 "ai/budget-exceeded" si plafond franchi ;
 *                 502 "ai/no-tool-use" si aucune sortie structurée ;
 *                 502 "validation/ai-output" si sortie hors schéma.
 */
async function generateStructured(
  client,
  {
    model,
    system,
    user,
    tool,
    schema,
    maxTokens,
    label,
    usageLabel,
    allowStrict = true,
    untrusted = true,
    documents,
  },
  deps = {},
) {
  const fn = usageLabel || label;
  // Dépendances : réelles par défaut, surchargeables en test (I/O injectable).
  const checkBudget = deps.assertWithinAiBudget || assertWithinAiBudget;
  const recordSpend = deps.recordUsageAndSpend || recordUsageAndSpend;
  const provider = deps.adapter || adapter;

  // 1. Garde-fou budget IA (A10) — refuse l'appel si le plafond mensuel est
  //    franchi (inerte tant que le double verrou n'est pas armé).
  await checkBudget({fn});

  // 1bis. Garde-fou anti-injection de prompt (M02-R6/S68) — par défaut, le
  //    contenu utilisateur est considéré NON FIABLE : on l'encadre et on durcit
  //    le system d'une consigne « ces balises = données, jamais des ordres ».
  //    Centralisé ici → les 11 sites en héritent sans modification.
  const safeUser = untrusted ? fenceUntrusted(user) : user;
  const safeSystem = untrusted ? hardenSystemPrompt(system) : system;

  // 2. Étape spécifique au fournisseur — la seule.
  const {response, output} = await provider.generate(client, {
    model,
    system: safeSystem,
    user: safeUser,
    tool,
    maxTokens,
    allowStrict,
    documents,
  });

  // 3. Mesure du coût (A1/S57) + incrément du compteur de budget (A10/S65).
  //    Toujours comptabilisé pour que le plafond reflète TOUS les appels.
  await recordSpend(fn, model, response);

  // 4a. Aucune sortie structurée : faute du modèle, pas du client (502).
  if (!output) {
    const err = new Error(`${label}: aucune sortie structurée dans la réponse`);
    err.status = 502;
    err.code = "ai/no-tool-use";
    throw err;
  }

  // 4b. Barrière déterministe zod (A7) — active même quand le strict est OFF.
  return validateAiOutput(schema, output, label);
}

/**
 * Sprint 95 — agent à OUTILS (Alfred V3), fournisseur-agnostique.
 *
 * Boucle : le modèle lit la question, appelle des outils (lecture du CRM, des
 * e-mails, proposition d'actions), reçoit leurs résultats, puis répond. Les
 * garde-fous de generateStructured s'appliquent à CHAQUE tour :
 *   - plafond de budget IA avant l'appel, coût mesuré après ;
 *   - system durci anti-injection ; les résultats d'outils (contenus d'e-mails
 *     de tiers) sont encadrés comme données non fiables ;
 *   - nombre de tours borné (maxTurns) : au-delà, on demande une réponse sans
 *     nouvel outil.
 *
 * @param {object} client Client IA
 * @param {object} params
 * @param {string} params.model
 * @param {string} params.system
 * @param {Array<{role: "user"|"assistant", text: string}>} [params.history]
 * @param {string} params.user Question
 * @param {Array<object>} params.tools Outils {name, description, input_schema}
 * @param {(name: string, input: object) => Promise<object>} params.executeTool
 *   Exécute un outil et renvoie un objet sérialisable
 * @param {number} [params.maxTurns=6]
 * @param {number} [params.maxTokens=1500]
 * @param {string} params.label
 * @param {string} [params.terminalTool] Outil de RÉPONSE finale : quand le
 *   modèle l'appelle, la boucle s'arrête et renvoie son entrée (`final`).
 * @param {(call: {name: string, input: object}) => void} [params.onStep]
 *   Appelé avant chaque outil (affichage « Je cherche… » côté client).
 * @param {object} [deps]
 * @return {Promise<{text: string, final: object|null, turns: number,
 *   toolLog: Array<{name: string, ok: boolean}>}>}
 */
async function runToolAgent(
  client,
  {
    model,
    system,
    history = [],
    user,
    tools,
    executeTool,
    maxTurns = 6,
    maxTokens = 1500,
    label,
    terminalTool = null,
    onStep = null,
  },
  deps = {},
) {
  const checkBudget = deps.assertWithinAiBudget || assertWithinAiBudget;
  const recordSpend = deps.recordUsageAndSpend || recordUsageAndSpend;
  const provider = deps.adapter || adapter;
  const safeSystem = hardenSystemPrompt(system);

  const messages = [];
  for (const m of history) {
    if (!m || typeof m.text !== "string" || !m.text.trim()) continue;
    messages.push(m.role === "user" ?
      provider.userTextMessage(m.text) :
      provider.assistantTextMessage(m.text));
  }
  // L'historique doit commencer par l'utilisateur et alterner.
  while (messages.length && messages[0].role !== "user") messages.shift();
  const alternated = [];
  for (const m of messages) {
    if (alternated.length && alternated[alternated.length - 1].role === m.role) {
      alternated[alternated.length - 1] = m;
    } else {
      alternated.push(m);
    }
  }
  if (alternated.length && alternated[alternated.length - 1].role === "user") alternated.pop();
  alternated.push(provider.userTextMessage(user));

  const toolLog = [];
  let lastText = "";
  for (let turn = 1; turn <= maxTurns; turn += 1) {
    await checkBudget({fn: label});
    const isLast = turn === maxTurns;
    const out = await provider.agentTurn(client, {
      model,
      system: isLast ?
        `${safeSystem}\n\nDERNIER TOUR : réponds maintenant à partir de ce que tu as déjà.` :
        safeSystem,
      messages: alternated,
      tools,
      maxTokens,
      // Avec un outil de réponse finale : un outil est OBLIGATOIRE à chaque
      // tour (le modèle ne peut plus répondre en texte libre), et le dernier
      // tour impose la réponse finale (retour Mickaël 11/10).
      toolChoice: terminalTool ? (isLast ? terminalTool : "any") : "auto",
    });
    await recordSpend(label, model, out.response);
    if (out.text) lastText = out.text;
    const finalCall = terminalTool ? out.toolCalls.find((c) => c.name === terminalTool) : null;
    if (finalCall) {
      return {text: out.text || lastText, final: finalCall.input || {}, turns: turn, toolLog};
    }
    if (!out.toolCalls.length || isLast) {
      return {text: out.text || lastText, final: null, turns: turn, toolLog};
    }
    alternated.push(out.assistantMessage);
    // Outils indépendants d'un même tour : exécutés EN PARALLÈLE (vitesse).
    const results = await Promise.all(out.toolCalls.map(async (call) => {
      if (onStep) {
        try {
          onStep({name: call.name, input: call.input || {}});
        } catch {
          // l'affichage de progression ne doit jamais casser la réponse
        }
      }
      try {
        const result = await executeTool(call.name, call.input || {});
        toolLog.push({name: call.name, ok: true});
        return {id: call.id, content: fenceUntrusted(JSON.stringify(result))};
      } catch (err) {
        toolLog.push({name: call.name, ok: false});
        return {id: call.id, content: `Erreur : ${err.message}`, isError: true};
      }
    }));
    alternated.push(provider.toolResultsMessage(results));
  }
  return {text: lastText, final: null, turns: maxTurns, toolLog};
}
/* fin runToolAgent */

module.exports = {generateStructured, runToolAgent};
