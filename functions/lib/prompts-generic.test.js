import {describe, it, expect, vi} from "vitest";
import {createRequire} from "module";
const require = createRequire(import.meta.url);
const {styleFromPrefs, buildReplySystem, buildThreadUser, buildAnalyzeSystem, buildAssistantSystem, TOOL_ANALYZE, SYSTEM_ANALYZE, EMPTY_PROFILE} = require("./prompts-generic");

describe("consignes IA génériques", () => {
  it("traduit les préférences d'assistant de la configuration", () => {
    expect(styleFromPrefs({tone: "direct", concision: "short", language: "en"})).toEqual({
      tone: expect.stringContaining("direct"), length: expect.stringContaining("court"), language: "anglais",
    });
    expect(styleFromPrefs({tone: "inconnu"}).tone).toContain("cordial");
  });
  it("ne contient aucun vocabulaire Trendl / CRM", () => {
    const all = [buildAnalyzeSystem(EMPTY_PROFILE), buildReplySystem({}, {}, EMPTY_PROFILE)].join(" ").toLowerCase();
    for (const w of ["trendl", "créateur", "influence", "opportunit", "crm", "marque"]) expect(all).not.toContain(w);
  });
  it("le fil est présenté du point de vue de l'utilisateur", () => {
    const t = buildThreadUser([{from: "a@x.example", subject: "S", bodyText: "bonjour"}, {direction: "outbound", subject: "Re: S", bodyText: "ok"}]);
    expect(t).toContain("Message 1");
    expect(t).toContain("VOUS (utilisateur)");
  });
});

const PROFILE = {
  ...EMPTY_PROFILE,
  companyName: "Chocolaterie Exemple",
  assistant: {
    name: "Alfred", tone: "direct", concision: "short", language: "fr", formality: "adapt",
    signatureText: "Camille, votre chocolatière\n01 02 03 04 05", forbiddenTerms: "Le tiret cadratin.",
    exampleResponse: "Bonjour Marie,\n\nMerci !", instructions: "Paragraphes très courts.", avoidPromises: true,
  },
  context: {activity: "Chocolats bio à Paris.", escalationRules: "Les réclamations clients.", importantSenders: ["annie do"], emailTypes: ["Fournisseurs"]},
  referenceTexts: [{fileName: "style.txt", text: "Jamais de jargon."}],
};

describe("consignes IA : profil du client (questionnaire v2)", () => {
  it("le brouillon reprend le style d'écriture, la signature et le contexte du client", () => {
    const sys = buildReplySystem({tone: "cordial"}, {signature: "ancienne"}, PROFILE);
    for (const s of ["Chocolats bio à Paris.", "Paragraphes très courts.", "Le tiret cadratin.", "Camille, votre chocolatière", "Bonjour Marie", "Jamais de jargon.", "tutoie", "engagement non confirmé"]) {
      expect(sys).toContain(s);
    }
    expect(sys).toContain("direct"); // le profil serveur prime sur le ton envoyé par l'application
    expect(sys).not.toContain("ancienne");
  });
  it("l'analyse connaît les priorités du client et sait signaler l'urgence", () => {
    const sys = buildAnalyzeSystem(PROFILE);
    expect(sys).toContain("Les réclamations clients.");
    expect(sys).toContain("annie do");
    expect(sys.startsWith(SYSTEM_ANALYZE)).toBe(true);
    expect(TOOL_ANALYZE.input_schema.required).toContain("urgent");
  });
  it("l'assistant a sa propre personnalité, distincte du style des brouillons", () => {
    const sys = buildAssistantSystem({}, {today: "2026-11-19"}, {...PROFILE, assistant: {...PROFILE.assistant, persona: "Rockeuse, cash, zéro bla-bla."}});
    expect(sys).toContain("PERSONNALITÉ DE ALFRED");
    expect(sys).toContain("zéro bla-bla");
    expect(buildReplySystem({}, {}, {...PROFILE, assistant: {...PROFILE.assistant, persona: "Rockeuse"}})).not.toContain("Rockeuse");
  });
  it("l'assistant porte le nom choisi par le client", () => {
    expect(buildAssistantSystem({name: "Assistant"}, {today: "2026-11-19"}, PROFILE)).toContain("Tu es Alfred");
  });
  it("sans profil, les consignes restent génériques", () => {
    expect(buildReplySystem({}, {}, EMPTY_PROFILE)).not.toContain("STYLE D'ÉCRITURE");
    expect(buildAnalyzeSystem(EMPTY_PROFILE)).toBe(SYSTEM_ANALYZE);
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
