import {describe, it, expect} from "vitest";
import {pickSender, formatFrom} from "./sender-identity.js";

describe("sender-identity", () => {
  const primary = "max@trendl.agency";
  it("garde la boîte principale sans profil", () => {
    expect(pickSender({primary})).toEqual({from: primary, email: primary, alias: false});
  });
  it("met le prénom de la personne en nom affiché", () => {
    expect(pickSender({primary, user: {sender_name: "Mickael"}}).from).toBe("Mickael <max@trendl.agency>");
    expect(formatFrom("Mickaël", primary)).toMatch(/^=\?UTF-8\?B\?.+\?= <max@trendl\.agency>$/);
  });
  it("utilise l'alias seulement s'il est vérifié dans Gmail", () => {
    const user = {sender_name: "Mickael", sender_email: "mickael@trendl.agency"};
    const ok = pickSender({primary, user, sendAs: [{sendAsEmail: "mickael@trendl.agency", verificationStatus: "accepted"}]});
    expect(ok).toEqual({from: "Mickael <mickael@trendl.agency>", email: "mickael@trendl.agency", alias: true});
    expect(pickSender({primary, user, sendAs: [{sendAsEmail: "mickael@trendl.agency", verificationStatus: "pending"}]}).alias).toBe(false);
    expect(pickSender({primary, user, sendAs: null}).email).toBe(primary);
  });
});
