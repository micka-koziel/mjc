/**
 * Tests Vitest (env node) de l'interface IA neutre `generateStructured`
 * (Sprint 67, Action 15). On bouchonne le client (aucun appel API réel) et le
 * garde-fou budget, mais on garde la VRAIE validation zod (barrière A7).
 *
 * Couvre, en plus des cas de contrat repris de l'ancien runToolCall :
 *  - le budget est vérifié AVANT l'appel API (et le bloque s'il lève) ;
 *  - le coût est mesuré APRÈS avec (label, model, response) ;
 *  - usageLabel prime sur label pour budget + observabilité.
 */

import {describe, it, expect, vi, beforeEach, afterEach} from "vitest";

// Garde-fou budget bouchonné : on espionne sans toucher au vrai compteur.
vi.mock("./budget-guard", () => ({
  assertWithinAiBudget: vi.fn(),
  recordUsageAndSpend: vi.fn(),
}));

import {z} from "zod";
import {generateStructured} from "./ai-provider.js";
import {
  assertWithinAiBudget,
  recordUsageAndSpend,
} from "./budget-guard";

const schema = z.object({ok: z.boolean()});
const tool = {name: "demo_tool", input_schema: {type: "object"}};

/** Construit un client bouchonné avec deux espions create (standard + bêta). */
function makeClient(toolUseInput) {
  const reply = {content: [{type: "tool_use", input: toolUseInput}]};
  const standard = vi.fn(async () => reply);
  const beta = vi.fn(async () => reply);
  return {messages: {create: standard}, beta: {messages: {create: beta}}};
}

const baseArgs = {
  model: "m",
  system: "s",
  tool,
  user: "u",
  maxTokens: 100,
  schema,
  label: "demo",
};

// Sprint 86 — TOUS les tests qui appellent generateStructured injectent le
// garde-fou budget + la mesure de coût comme dépendances (3ᵉ argument), au lieu
// de compter sur l'interception de require("./budget-guard") par vi.mock —
// peu fiable sur les libs CJS (cf feedback_pattern_vi_mock_firebase). Quand
// l'interception ratait, les vraies implémentations tournaient et faisaient
// dépasser le délai de 5 s en CI (timeouts intermittents).
const budgetDeps = () => ({ assertWithinAiBudget, recordUsageAndSpend });

afterEach(() => {
  delete process.env.ANTHROPIC_STRICT_OUTPUTS;
  vi.clearAllMocks();
});

describe("generateStructured — chemin standard (flag OFF)", () => {
  beforeEach(() => {
    delete process.env.ANTHROPIC_STRICT_OUTPUTS;
  });

  it("appelle messages.create (pas la bêta) et renvoie la sortie validée", async () => {
    const client = makeClient({ok: true});
    const out = await generateStructured(client, baseArgs, budgetDeps());
    expect(out).toEqual({ok: true});
    expect(client.messages.create).toHaveBeenCalledTimes(1);
    expect(client.beta.messages.create).not.toHaveBeenCalled();
  });

  it("REJETTE une sortie hors schéma (barrière zod)", async () => {
    const client = makeClient({ok: "pas un booléen"});
    await expect(generateStructured(client, baseArgs, budgetDeps())).rejects.toThrow(/ok/);
  });

  it("lève 502 ai/no-tool-use si aucune sortie structurée", async () => {
    const client = {
      messages: {create: vi.fn(async () => ({content: [{type: "text"}]}))},
      beta: {messages: {create: vi.fn()}},
    };
    await expect(generateStructured(client, baseArgs, budgetDeps())).rejects.toMatchObject({
      status: 502,
      code: "ai/no-tool-use",
    });
  });
});

describe("generateStructured — chemin strict (flag ON)", () => {
  beforeEach(() => {
    process.env.ANTHROPIC_STRICT_OUTPUTS = "true";
  });

  it("appelle beta.messages.create avec strict + en-tête bêta", async () => {
    const client = makeClient({ok: true});
    await generateStructured(client, baseArgs, budgetDeps());
    expect(client.beta.messages.create).toHaveBeenCalledTimes(1);
    expect(client.messages.create).not.toHaveBeenCalled();
    const params = client.beta.messages.create.mock.calls[0][0];
    expect(params.betas).toContain("structured-outputs-2025-11-13");
    expect(params.tools[0].strict).toBe(true);
  });

  it("garde le chemin standard si allowStrict=false (cas Haiku)", async () => {
    const client = makeClient({ok: true});
    await generateStructured(client, {...baseArgs, allowStrict: false}, budgetDeps());
    expect(client.messages.create).toHaveBeenCalledTimes(1);
    expect(client.beta.messages.create).not.toHaveBeenCalled();
  });
});

describe("generateStructured — budget & observabilité (préoccupations neutres)", () => {
  beforeEach(() => {
    delete process.env.ANTHROPIC_STRICT_OUTPUTS;
  });

  // On INJECTE le garde-fou budget + la mesure de coût comme dépendances
  // (3ᵉ argument). C'est plus fiable que d'intercepter le `require` CommonJS du
  // module budget-guard : le code de prod et le test partagent la même
  // référence d'espion. Ces deux spies sont déjà des vi.fn() (cf vi.mock).
  it("vérifie le budget AVANT l'appel API, puis mesure le coût APRÈS", async () => {
    const client = makeClient({ok: true});
    await generateStructured(client, baseArgs, budgetDeps());
    expect(assertWithinAiBudget).toHaveBeenCalledWith({fn: "demo"});
    expect(recordUsageAndSpend).toHaveBeenCalledTimes(1);
    const [fn, model] = recordUsageAndSpend.mock.calls[0];
    expect(fn).toBe("demo");
    expect(model).toBe("m");
  });

  it("si le budget est dépassé, l'appel API n'a PAS lieu", async () => {
    assertWithinAiBudget.mockRejectedValueOnce(
      Object.assign(new Error("plafond"), {status: 429, code: "ai/budget-exceeded"}),
    );
    const client = makeClient({ok: true});
    await expect(
      generateStructured(client, baseArgs, budgetDeps()),
    ).rejects.toMatchObject({
      code: "ai/budget-exceeded",
    });
    expect(client.messages.create).not.toHaveBeenCalled();
    expect(recordUsageAndSpend).not.toHaveBeenCalled();
  });

  it("usageLabel prime sur label pour budget + coût", async () => {
    const client = makeClient({ok: true});
    await generateStructured(
      client,
      {...baseArgs, usageLabel: "cost.label"},
      budgetDeps(),
    );
    expect(assertWithinAiBudget).toHaveBeenCalledWith({fn: "cost.label"});
    expect(recordUsageAndSpend.mock.calls[0][0]).toBe("cost.label");
  });
});
