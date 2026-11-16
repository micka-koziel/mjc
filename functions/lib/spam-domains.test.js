import {describe, it, expect} from "vitest";
import {spamDomainOf} from "./spam-domains.js";

describe("spamDomainOf", () => {
  const s = {spam_domains: ["exemple-spam.com", ".xyz", "@pub.example"]};
  it("bloque un domaine exact et ses sous-domaines", () => {
    expect(spamDomainOf("A <a@exemple-spam.com>", s)).toBe("exemple-spam.com");
    expect(spamDomainOf("a@mail.exemple-spam.com", s)).toBe("exemple-spam.com");
  });
  it("bloque un suffixe", () => {
    expect(spamDomainOf("x@truc.xyz", s)).toBe(".xyz");
  });
  it("laisse passer le reste", () => {
    expect(spamDomainOf("x@client.example", s)).toBe("");
  });
});
