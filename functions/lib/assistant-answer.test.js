import {describe, it, expect} from "vitest";
import {createRequire} from "module";
const require = createRequire(import.meta.url);
const {plainText, normalizeAnswer, answerAsText, collectThreadIds} = require("./assistant-answer.js");

describe("plainText", () => {
  it("retire astérisques, titres, émojis", () => {
    expect(plainText("🚨 **PRIORITÉ MAXIMALE** — 3 urgences\n## Titre\n* point *a*")).toBe("PRIORITÉ MAXIMALE — 3 urgences\nTitre\n• point a");
  });
  it("garde le texte simple intact", () => {
    expect(plainText("Deux e-mails à traiter.")).toBe("Deux e-mails à traiter.");
  });
});

describe("normalizeAnswer", () => {
  const known = new Set(["t1"]);
  it("garde les actions valides et les liens connus", () => {
    const r = normalizeAnswer({resume: "**3 urgences.**", actions: [
      {titre: "Envoyer les éléments de paie à Bastien", thread_id: "t1", echeance: "vendredi midi", type: "repondre"},
      {titre: "Rappeler Hélène", thread_id: "inventé", type: "repondre"},
      {titre: ""},
      "n'importe quoi",
    ]}, {knownThreads: known});
    expect(r.text).toBe("3 urgences.");
    expect(r.actions).toEqual([
      {title: "Envoyer les éléments de paie à Bastien", threadId: "t1", due: "vendredi midi", kind: "repondre"},
      {title: "Rappeler Hélène", threadId: null, due: null, kind: "tache"},
    ]);
  });
  it("limite à 5 actions et accepte l'ancien format", () => {
    const r = normalizeAnswer({answer: "ok", actions: Array.from({length: 9}, (_, i) => ({titre: `a${i}`}))});
    expect(r.text).toBe("ok");
    expect(r.actions).toHaveLength(5);
  });
  it("texte de repli si la réponse est vide", () => {
    expect(normalizeAnswer(null, {fallbackText: "*salut*"}).text).toBe("salut");
    expect(normalizeAnswer(null).text).toBe("Rien à signaler.");
  });
});

describe("answerAsText / collectThreadIds", () => {
  it("résume pour l'historique", () => {
    expect(answerAsText({text: "Deux choses.", actions: [{title: "A", due: "demain", threadId: "t1"}]})).toBe("Deux choses.\n1. A (demain) [fil t1]");
  });
  it("relève les fils vus par les outils", () => {
    const s = collectThreadIds({fils: [{thread_id: "a"}, {thread_id: "b"}]}, new Set());
    collectThreadIds({thread_id: "c"}, s);
    expect([...s]).toEqual(["a", "b", "c"]);
  });
});

describe("parité avec l'écran", () => {
  it("même nettoyage que src/shared/utils/plain-text.js", async () => {
    const front = await import("../../src/shared/utils/plain-text.js");
    for (const s of ["🚨 **A** — b", "# T\n- x\n* y", "`code` __gras__ ***z***", "a\n\n\n\nb", ""]) {
      expect(front.plainText(s)).toBe(plainText(s));
    }
  });
});
