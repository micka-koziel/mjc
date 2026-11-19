import {describe, it, expect} from "vitest";
import {createRequire} from "module";
const require = createRequire(import.meta.url);
const {isAdmin, checkAccessRequest, adminEmails} = require("./access");

const env = {ADMIN_EMAILS: " Mickael@Exemple.fr , autre@exemple.fr"};

describe("gestion des accès", () => {
  it("reconnaît les administrateurs sans tenir compte de la casse", () => {
    expect(adminEmails(env)).toEqual(["mickael@exemple.fr", "autre@exemple.fr"]);
    expect(isAdmin("MICKAEL@exemple.fr", env)).toBe(true);
    expect(isAdmin("invite@exemple.fr", env)).toBe(false);
    expect(isAdmin("x@y.fr", {})).toBe(false);
  });
  it("normalise l'adresse et refuse une adresse invalide", () => {
    expect(checkAccessRequest({action: "grant", email: " Carine@Exemple.FR ", displayName: "Carine"}, env)).toEqual({ok: true, email: "carine@exemple.fr", displayName: "Carine"});
    expect(checkAccessRequest({action: "grant", email: "carine"}, env).ok).toBe(false);
  });
  it("interdit de se retirer soi-même ou de retirer un administrateur", () => {
    expect(checkAccessRequest({action: "revoke", email: "mickael@exemple.fr", requester: "mickael@exemple.fr"}, env).ok).toBe(false);
    expect(checkAccessRequest({action: "revoke", email: "autre@exemple.fr", requester: "mickael@exemple.fr"}, env).ok).toBe(false);
    expect(checkAccessRequest({action: "revoke", email: "carine@exemple.fr", requester: "mickael@exemple.fr"}, env).ok).toBe(true);
  });
});
