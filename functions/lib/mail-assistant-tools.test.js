import {describe, it, expect} from "vitest";
import {createMailToolbox, MAIL_TOOLS} from "./mail-assistant-tools.js";

const now = new Date("2026-11-16T12:00:00Z");
const ms = (h) => now.getTime() - h * 3600000;
const messages = [
  {id: "a", threadId: "t1", from: "Jean <jean@dupont.example>", subject: "Commande", bodyText: "150 coffrets", labels: ["INBOX"], receivedAt: ms(2)},
  {id: "b", threadId: "t1", from: "Moi <moi@x.example>", subject: "Re: Commande", bodyText: "ok", labels: ["SENT"], receivedAt: ms(1)},
  {id: "c", threadId: "t2", from: "spam <s@spam.example>", subject: "Gagné", bodyText: "cliquez", labels: ["SPAM"], receivedAt: ms(30)},
];
const box = createMailToolbox({
  now,
  recentMessages: async () => messages,
  readThread: async (id) => messages.filter((m) => m.threadId === id),
  loadTodos: async () => [{id: "x", text: "Devis", todo_kind: "Ponctuel", due_date: "2026-11-16", done: false}, {id: "y", text: "Fait", todo_kind: "Ponctuel", done: true}],
});

describe("outils de l'assistant e-mails", () => {
  it("aucun outil CRM n'est exposé", () => {
    expect(MAIL_TOOLS.map((t) => t.name)).toEqual(["chercher_mails", "lire_fil", "chercher_todos", "repondre"]);
  });
  it("cherche par mots (accents ignorés) et regroupe par fil", async () => {
    const r = await box.execute("chercher_mails", {texte: "COFFRETS"});
    expect(r.fils).toHaveLength(1);
    expect(r.fils[0].thread_id).toBe("t1");
  });
  it("filtre par dossier et par fenêtre de temps", async () => {
    expect((await box.execute("chercher_mails", {dossier: "spam"})).fils[0].thread_id).toBe("t2");
    expect((await box.execute("chercher_mails", {depuis_heures: 12, dossier: "tous"})).mails_trouves).toBe(2);
  });
  it("lit un fil dans l'ordre chronologique", async () => {
    const r = await box.execute("lire_fil", {thread_id: "t1"});
    expect(r.mails.map((m) => m.sens)).toEqual(["reçu", "envoyé par vous"]);
  });
  it("liste les tâches non faites", async () => {
    expect((await box.execute("chercher_todos", {})).todos.map((t) => t.id)).toEqual(["x"]);
  });
});
