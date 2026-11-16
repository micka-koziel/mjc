/**
 * Tests des schémas de sortie IA (principe repris de Trendl, Sprint 61) :
 * tout champ manquant ou hors énumération est rejeté avant écriture.
 */
import {describe, it, expect} from "vitest";
import {
  emailAnalysisOutputSchema,
  summarizeEmailsOutputSchema,
  threadSummaryOutputSchema,
  validateAiOutput,
} from "./ai-schemas.js";

const OK = {
  category: "action",
  senderName: "Jean Exemple",
  senderCompany: null,
  summary1Line: "Jean demande de confirmer une date de livraison.",
  expectedAction: "Confirmer la date",
  language: "fr",
};

describe("emailAnalysisOutputSchema", () => {
  it("accepte une analyse complète", () => {
    expect(() => validateAiOutput(emailAnalysisOutputSchema, OK, "t")).not.toThrow();
  });
  it("rejette une catégorie hors énumération (aucune catégorie CRM)", () => {
    expect(() => validateAiOutput(emailAnalysisOutputSchema, {...OK, category: "opportunite"}, "t")).toThrow();
  });
  it("rejette un résumé manquant", () => {
    const {summary1Line, ...rest} = OK;
    expect(summary1Line).toBeTruthy();
    expect(() => validateAiOutput(emailAnalysisOutputSchema, rest, "t")).toThrow();
  });
});

describe("résumés", () => {
  it("résumé 12 h : classification générique", () => {
    expect(() => validateAiOutput(summarizeEmailsOutputSchema, {summary_text: "x", items: [{id: "1", classification: "a_traiter", score: 3}]}, "t")).not.toThrow();
    expect(() => validateAiOutput(summarizeEmailsOutputSchema, {summary_text: "x", items: [{id: "1", classification: "opportunite", score: 3}]}, "t")).toThrow();
  });
  it("résumé de fil : statut requis", () => {
    expect(() => validateAiOutput(threadSummaryOutputSchema, {summary: "x", keyPoints: []}, "t")).toThrow();
  });
  it("attache status 502 et code validation/ai-output", () => {
    try {
      validateAiOutput(threadSummaryOutputSchema, {}, "t");
    } catch (e) {
      expect(e.status).toBe(502);
      expect(e.code).toBe("validation/ai-output");
    }
  });
});
