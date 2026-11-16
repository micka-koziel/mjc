import {describe, it, expect} from "vitest";
import {createRequire} from "module";
const require = createRequire(import.meta.url);
process.env.INTERNAL_DOMAINS = "monentreprise.example";
const {suggestReplyCc} = require("./reply-cc");

describe("Sprint 98 (#9) — Cc d'une réponse (« répondre à tous »)", () => {
  const inbound = {
    labels: ["INBOX"],
    from: "Yu Rui <yurui@lumistar.com>",
    to: ["Camille <camille@monentreprise.example>"],
    cc: ["Lisa <lisa@mds-agency.com>", "yurui@lumistar.com"],
  };

  it("reprend les personnes en copie, sans l'expéditeur ni l'entreprise", () => {
    expect(suggestReplyCc(inbound, "yurui@lumistar.com")).toBe("lisa@mds-agency.com");
  });

  it("mail sortant (relance) : les autres destinataires, sans le principal ni l'adresse interne du fil", () => {
    const out = {labels: ["SENT"], from: "aurel@gmail.com", to: ["a@brand.com", "b@brand.com"], cc: ["aurel@gmail.com"]};
    expect(suggestReplyCc(out, "a@brand.com", [out])).toBe("b@brand.com");
  });

  it("personne en copie → vide", () => {
    expect(suggestReplyCc({labels: ["INBOX"], from: "a@b.com", to: ["camille@monentreprise.example"]}, "a@b.com")).toBe("");
    expect(suggestReplyCc(null, "a@b.com")).toBe("");
  });
});
