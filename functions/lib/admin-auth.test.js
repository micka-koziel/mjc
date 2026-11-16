import {describe, it, expect, vi} from "vitest";
vi.mock("./firebase-admin", () => ({admin: {}, db: {}}));
const {requireUser, allowedEmails} = await import("./admin-auth.js");

const verify = async () => ({uid: "u1", email: "Camille@Exemple.fr"});
const noDoc = async () => [];

describe("requireUser", () => {
  it("accepte une adresse de la liste (insensible à la casse)", async () => {
    const p = await requireUser({}, {verify, readAccessList: noDoc, env: {ALLOWED_EMAILS: "camille@exemple.fr, autre@exemple.fr"}});
    expect(p).toEqual({uid: "u1", email: "camille@exemple.fr", role: "user"});
  });
  it("refuse une adresse absente (403)", async () => {
    await expect(requireUser({}, {verify, readAccessList: noDoc, env: {ALLOWED_EMAILS: "autre@exemple.fr"}})).rejects.toMatchObject({status: 403});
  });
  it("accepte une adresse de la liste Firestore app_settings/access", async () => {
    const p = await requireUser({}, {verify, readAccessList: async () => ["camille@exemple.fr"], env: {}});
    expect(p.email).toBe("camille@exemple.fr");
  });
  it("refuse tout le monde si la liste est vide", async () => {
    expect(allowedEmails({})).toEqual([]);
    await expect(requireUser({}, {verify, readAccessList: noDoc, env: {}})).rejects.toMatchObject({status: 403});
  });
});
