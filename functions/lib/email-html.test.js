/**
 * Sprint 90 — Tests de la mise en forme HTML simple des emails sortants.
 */
import {describe, it, expect} from "vitest";
import {
  escapeHtml,
  autolink,
  textToSimpleHtml,
  withSimpleHtmlBody,
} from "./email-html.js";

describe("escapeHtml", () => {
  it("neutralise les caracteres HTML", () => {
    expect(escapeHtml("<b>a & b</b>")).toBe("&lt;b&gt;a &amp; b&lt;/b&gt;");
  });

  it("tolere null et undefined", () => {
    expect(escapeHtml(null)).toBe("");
    expect(escapeHtml(undefined)).toBe("");
  });
});

describe("autolink", () => {
  it("rend une URL cliquable", () => {
    const out = autolink("voir https://trendl.agency/offres");
    expect(out).toContain("<a href=\"https://trendl.agency/offres\"");
    expect(out).toContain(">https://trendl.agency/offres</a>");
  });

  it("laisse la ponctuation finale hors du lien", () => {
    const out = autolink("rendez-vous sur https://trendl.agency.");
    expect(out).toContain("href=\"https://trendl.agency\"");
    expect(out.endsWith(".")).toBe(true);
  });

  it("rend une adresse email cliquable", () => {
    const out = autolink("ecrivez a max@trendl.agency pour la suite");
    expect(out).toContain("<a href=\"mailto:max@trendl.agency\"");
  });

  it("ne double pas les liens deja construits", () => {
    const once = autolink("contact: max@trendl.agency");
    expect(once.match(/mailto:/g)).toHaveLength(1);
  });
});

describe("textToSimpleHtml", () => {
  it("fixe une police web-safe en style inline", () => {
    const html = textToSimpleHtml("Bonjour");
    expect(html).toContain("font-family:Arial, Helvetica, sans-serif");
    expect(html).toContain("font-size:14px");
    expect(html).not.toContain("<style");
  });

  it("transforme les lignes vides en paragraphes", () => {
    const html = textToSimpleHtml("Bonjour Max,\n\nVoici le script.\nA bientot");
    expect(html.match(/<p /g)).toHaveLength(2);
    expect(html).toContain("Voici le script.<br />A bientot");
  });

  it("echappe le contenu avant de le mettre en forme", () => {
    const html = textToSimpleHtml("<script>alert(1)</script>");
    expect(html).not.toContain("<script>");
    expect(html).toContain("&lt;script&gt;");
  });

  it("gere un corps vide sans planter", () => {
    expect(textToSimpleHtml("")).toContain("&nbsp;");
    expect(textToSimpleHtml(null)).toContain("&nbsp;");
  });

  it("accepte une police personnalisee", () => {
    const html = textToSimpleHtml("Salut", {fontFamily: "Georgia, serif"});
    expect(html).toContain("font-family:Georgia, serif");
  });
});

describe("withSimpleHtmlBody", () => {
  it("ajoute bodyHtml a partir de bodyText", () => {
    const out = withSimpleHtmlBody({to: "a@b.c", bodyText: "Bonjour"});
    expect(out.bodyText).toBe("Bonjour");
    expect(out.bodyHtml).toContain("Bonjour");
  });

  it("ne mute pas le payload d'origine", () => {
    const input = {bodyText: "Bonjour"};
    withSimpleHtmlBody(input);
    expect(input.bodyHtml).toBeUndefined();
  });

  it("respecte un bodyHtml deja fourni", () => {
    const out = withSimpleHtmlBody({bodyText: "x", bodyHtml: "<b>x</b>"});
    expect(out.bodyHtml).toBe("<b>x</b>");
  });

  it("ne fait rien si le corps texte est vide", () => {
    expect(withSimpleHtmlBody({bodyText: "   "}).bodyHtml).toBeUndefined();
    expect(withSimpleHtmlBody({}).bodyHtml).toBeUndefined();
    expect(withSimpleHtmlBody(null)).toEqual({});
  });
});
