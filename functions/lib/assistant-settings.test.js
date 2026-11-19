import {describe, it, expect} from "vitest";
import {createRequire} from "module";
const require = createRequire(import.meta.url);
const {validateSettings, effectiveProfile} = require("./assistant-settings");

describe("réglages de l'assistant (serveur)", () => {
  it("parité : tout réglage normalisé par l'application est accepté par le serveur", async () => {
    const {normalizePriorities, normalizeReplies} = await import("../../src/features/settings/lib/assistant-settings.js");
    const samples = [{}, {senders: [{match: "Annie Do", level: "strategic"}], keywords: ["réclamation"], maxItems: 99, urgentBonus: -500}, {excludedCategories: []}];
    for (const s of samples) expect(validateSettings("priorities", normalizePriorities(s)).ok).toBe(true);
    for (const s of [{}, {tone: "direct", formality: "adapt", signatureText: "Carine"}]) expect(validateSettings("replies", normalizeReplies(s)).ok).toBe(true);
  });
  it("refuse un réglage hors limites ou inconnu", () => {
    expect(validateSettings("priorities", {}).ok).toBe(false);
    expect(validateSettings("replies", {tone: "agressif"}).ok).toBe(false);
    expect(validateSettings("autre", {}).ok).toBe(false);
  });
  it("les réglages de l'utilisatrice priment sur le questionnaire", () => {
    const profile = {assistant: {tone: "cordial", signatureText: "Ancienne"}, context: {priorityExpectations: "Q", escalationRules: "E", importantSenders: ["x"]}};
    const out = effectiveProfile(profile, {
      replies: {tone: "direct", signatureText: ""},
      priorities: {aiRules: "Ruptures fournisseurs", senders: [{match: "annie do", level: "important"}, {match: "pub", level: "low"}], keywords: ["colis"]},
    });
    expect(out.assistant).toMatchObject({tone: "direct", signatureText: "", signature: "none"});
    expect(out.context).toMatchObject({priorityRules: "Ruptures fournisseurs", priorityExpectations: "", escalationRules: "", importantSenders: ["annie do"], priorityKeywords: ["colis"]});
    expect(profile.assistant.tone).toBe("cordial"); // le profil d'origine n'est pas modifié
    expect(effectiveProfile(profile, {})).toEqual({...profile, assistant: {...profile.assistant}, context: {...profile.context}});
  });
});
