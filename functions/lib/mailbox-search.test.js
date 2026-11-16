import {describe, it, expect} from "vitest";
import {createRequire} from "module";
const require = createRequire(import.meta.url);
const {buildGmailQuery, threadIdsFromGmail, MAX_THREADS} = require("./mailbox-search");

describe("recherche Mailbox via Gmail (S97)", () => {
  it("nettoie la requête et exclut corbeille / spam", () => {
    expect(buildGmailQuery("  cyber\nghost ")).toBe("cyber ghost -in:trash -in:spam");
    expect(buildGmailQuery("a")).toBe("");
    expect(buildGmailQuery("x".repeat(500)).length).toBeLessThan(230);
  });
  it("lit les fils de la réponse Gmail, dédupliqués et bornés", () => {
    expect(threadIdsFromGmail({threads: [{id: "a"}, {id: "a"}, {id: "b"}, {}]})).toEqual(["a", "b"]);
    expect(threadIdsFromGmail({})).toEqual([]);
    const many = {threads: Array.from({length: 60}, (_, i) => ({id: `t${i}`}))};
    expect(threadIdsFromGmail(many)).toHaveLength(MAX_THREADS);
  });
});
