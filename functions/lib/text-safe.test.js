import {describe, it, expect, vi} from "vitest";
import {createRequire} from "module";
const require = createRequire(import.meta.url);
const {wellFormed, safeSlice, wellFormedDeep, protectAiClient, publicAiError} = require("./text-safe");

const EMOJI = "😀"; // 2 unités JS : 😀

describe("text-safe (Sprint 102, bug GamsGo)", () => {
  it("une coupe .slice au milieu d'un emoji produit un JSON que l'API refuse", () => {
    const cut = `Offre ${EMOJI}`.slice(0, 7);
    expect(cut.isWellFormed()).toBe(false);
    expect(wellFormed(cut).isWellFormed()).toBe(true);
    expect(wellFormed(cut)).toBe("Offre �");
  });

  it("laisse intact un texte déjà propre (accents, emojis complets)", () => {
    const t = `Bonjour Rémi ${EMOJI} à très vite 🇫🇷`;
    expect(wellFormed(t)).toBe(t);
  });

  it("safeSlice ne coupe jamais un emoji en deux", () => {
    const t = `ab${EMOJI}cd`;
    expect(safeSlice(t, 3)).toBe("ab");
    expect(safeSlice(t, 4)).toBe(`ab${EMOJI}`);
    expect(safeSlice("court", 10)).toBe("court");
  });

  it("nettoie en profondeur une requête IA sans toucher l'original", () => {
    const bad = `x${EMOJI}`.slice(0, 2);
    const params = {model: "m", max_tokens: 10, system: bad, messages: [{role: "user", content: [{type: "text", text: bad}]}]};
    const out = wellFormedDeep(params);
    expect(JSON.stringify(out)).not.toMatch(/\\ud83d(?!\\ude)/i);
    expect(out.messages[0].content[0].text).toBe("x�");
    expect(params.system).toBe(bad);
    expect(out.max_tokens).toBe(10);
  });

  it("protectAiClient nettoie messages.create et beta.messages.create", async () => {
    const create = vi.fn(async (p) => p);
    const betaCreate = vi.fn(async (p) => p);
    const client = protectAiClient({messages: {create}, beta: {messages: {create: betaCreate}}});
    const bad = `${EMOJI}`.slice(0, 1);
    await client.messages.create({system: bad});
    await client.beta.messages.create({system: bad});
    expect(create.mock.calls[0][0].system).toBe("�");
    expect(betaCreate.mock.calls[0][0].system).toBe("�");
    expect(protectAiClient(client)).toBe(client);
    await client.messages.create({system: "ok"});
    expect(create).toHaveBeenCalledTimes(2);
  });

  it("publicAiError n'expose jamais la réponse brute du fournisseur", () => {
    const e = Object.assign(new Error("400 {\"type\":\"error\"...}"), {status: 400});
    const pub = publicAiError(e);
    expect(pub.error).not.toMatch(/\{/);
    expect(pub.status).toBe(502);
    expect(publicAiError(new Error("boom")).status).toBe(500);
    expect(publicAiError(Object.assign(new Error("Plafond"), {status: 429})).status).toBe(429);
  });
});

// Sprint 104.1 — panne du 29/10 : crédit Anthropic épuisé.
describe("Sprint 104.1 — erreur « crédit IA épuisé » lisible", () => {
  const {isCreditExhausted, isAiProviderError, aiErrorResponse} = require("./text-safe");
  const credit = Object.assign(new Error("400 {\"type\":\"error\",\"error\":{\"type\":\"invalid_request_error\",\"message\":\"Your credit balance is too low to access the Anthropic API.\"}}"), {
    status: 400, error: {type: "error", error: {type: "invalid_request_error", message: "Your credit balance is too low to access the Anthropic API."}},
  });

  it("reconnaît le crédit épuisé et le dit clairement", () => {
    expect(isCreditExhausted(credit)).toBe(true);
    const pub = publicAiError(credit);
    expect(pub.code).toBe("ai_credit_exhausted");
    expect(pub.error).toMatch(/Crédit IA épuisé/);
    expect(pub.error).not.toMatch(/fil d'e-mails/);
  });

  it("une autre erreur 400 garde son message habituel", () => {
    expect(publicAiError({status: 400, message: "400 bad"}).error).toMatch(/fil d'e-mails/);
  });

  it("aiErrorResponse : erreur IA lisible, erreur métier inchangée", () => {
    expect(aiErrorResponse(credit, "Rédaction impossible.").body.code).toBe("ai_credit_exhausted");
    expect(isAiProviderError(credit)).toBe(true);
    const metier = Object.assign(new Error("Collab introuvable"), {status: 404});
    expect(aiErrorResponse(metier, "Rédaction impossible.")).toEqual({status: 404, body: {error: "Rédaction impossible."}});
    expect(aiErrorResponse(new Error("boom")).body.error).toBe("boom");
  });
});
