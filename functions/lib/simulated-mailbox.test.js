import {describe, it, expect} from "vitest";
import {createRequire} from "module";
import fs from "node:fs";
const require = createRequire(import.meta.url);
const {isSimulatedMailbox, simulateLabels, buildSeedDocs, buildSentMessage, searchSimulated} = require("./simulated-mailbox");

const NOW = Date.parse("2026-11-19T10:00:00Z");

describe("boîte simulée (démonstration)", () => {
  it("ne s'active que sur demande explicite", () => {
    expect(isSimulatedMailbox({})).toBe(false);
    expect(isSimulatedMailbox({MAILBOX_PROVIDER: "gmail"})).toBe(false);
    expect(isSimulatedMailbox({MAILBOX_PROVIDER: " Simulated "})).toBe(true);
  });
  it("reproduit l'effet des actions sur les libellés", () => {
    expect(simulateLabels(["INBOX", "UNREAD"], "archive")).toEqual([]);
    expect(simulateLabels(["INBOX", "UNREAD"], "mark_read")).toEqual(["INBOX"]);
    expect(simulateLabels(["INBOX"], "trash")).toEqual(["TRASH"]);
    expect(simulateLabels(["INBOX", "UNREAD"], "spam")).toEqual(["SPAM"]);
    expect(() => simulateLabels([], "supprimer")).toThrow();
  });
  it("date le jeu « du jour » et déduit la direction des libellés", () => {
    const {messages, todos} = buildSeedDocs({
      messages: [
        {id: "a", threadId: "t", from: "X <x@y.example>", subject: "S", bodyText: "Bonjour   tout\nle monde", minutesAgo: 30, labels: ["INBOX"]},
        {id: "b", threadId: "t", from: "Moi <m@y.example>", subject: "Re: S", bodyText: "ok", minutesAgo: 10, labels: ["SENT"]},
      ],
      todos: [{id: "td", text: "T", todo_kind: "Ponctuel", dueInDays: 1, done: false}],
    }, NOW);
    expect(messages[0].doc.receivedAtMs).toBe(NOW - 30 * 60000);
    expect(messages[0].doc.snippet).toBe("Bonjour tout le monde");
    expect(messages.map((m) => m.doc.direction)).toEqual(["inbound", "outbound"]);
    expect(todos[0]).toMatchObject({id: "td", doc: {due_date: "2026-11-20"}});
  });
  it("range la réponse « envoyée » dans le fil d'origine", () => {
    const sent = buildSentMessage({original: {threadId: "t", reply_to: "a@b.example"}, text: "Merci !", subject: "Re: S", mode: "send", mailboxAddress: "Moi <m@y.example>", now: NOW});
    expect(sent).toMatchObject({threadId: "t", to: ["a@b.example"], labels: ["SENT"], direction: "outbound", from: "Moi <m@y.example>"});
  });
  it("cherche sans accents ni casse, tous les mots", () => {
    const msgs = [{threadId: "1", subject: "Réassort", bodyText: "tablettes jasmin"}, {threadId: "2", subject: "Facture", bodyText: "boîtes"}];
    expect(searchSimulated(msgs, "REASSORT jasmin")).toEqual(["1"]);
    expect(searchSimulated(msgs, "x")).toEqual([]);
  });
  it("le jeu de Mon jardin chocolaté est cohérent", () => {
    const data = JSON.parse(fs.readFileSync("config/clients/mjc/demo-mailbox.json", "utf8"));
    const {messages} = buildSeedDocs(data, NOW);
    expect(messages.length).toBeGreaterThanOrEqual(40);
    expect(new Set(messages.map((m) => m.id)).size).toBe(messages.length);
    expect(messages.some((m) => m.doc.from.includes("Annie Do"))).toBe(true);
    expect(messages.every((m) => !m.doc.bodyText.includes("—"))).toBe(true);
  });
});
