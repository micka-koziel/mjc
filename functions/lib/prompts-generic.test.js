import {describe, it, expect, vi} from "vitest";
import {createRequire} from "module";
const require = createRequire(import.meta.url);
const {styleFromPrefs, buildReplySystem, buildThreadUser, SYSTEM_ANALYZE} = require("./prompts-generic");

describe("consignes IA génériques", () => {
  it("traduit les préférences d'assistant de la configuration", () => {
    expect(styleFromPrefs({tone: "direct", concision: "short", language: "en"})).toEqual({
      tone: expect.stringContaining("direct"), length: expect.stringContaining("court"), language: "anglais",
    });
    expect(styleFromPrefs({tone: "inconnu"}).tone).toContain("cordial");
  });
  it("ne contient aucun vocabulaire Trendl / CRM", () => {
    const all = [SYSTEM_ANALYZE, buildReplySystem({}, {})].join(" ").toLowerCase();
    for (const w of ["trendl", "créateur", "influence", "opportunit", "crm", "marque"]) expect(all).not.toContain(w);
  });
  it("le fil est présenté du point de vue de l'utilisateur", () => {
    const t = buildThreadUser([{from: "a@x.example", subject: "S", bodyText: "bonjour"}, {direction: "outbound", subject: "Re: S", bodyText: "ok"}]);
    expect(t).toContain("Message 1");
    expect(t).toContain("VOUS (utilisateur)");
  });
});

vi.mock("firebase-functions/v2/firestore", () => ({onDocumentWritten: () => () => {}}));
describe("analyse : quand consommer de l'IA", () => {
  it("n'analyse ni les messages sortants, ni les brouillons, ni deux fois", () => {
    const {analysisDecision, MODEL_VERSION} = require("../analyze/analyzeEmail");
    expect(analysisDecision({labels: ["SENT"]})).toBe("skip:outbound");
    expect(analysisDecision({labels: ["DRAFT"]})).toBe("skip:draft");
    expect(analysisDecision({labels: ["INBOX"], analysis: {modelVersion: MODEL_VERSION, status: "completed"}})).toBe("skip:done");
    expect(analysisDecision({labels: ["SPAM"]})).toBe("spam");
    expect(analysisDecision({labels: ["INBOX"]})).toBe("analyze");
  });
});
