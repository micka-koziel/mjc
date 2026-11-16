/**
 * Outils de l'assistant conversationnel (périmètre e-mails + tâches).
 *
 * Repris de lib/alfred-tools.js (Trendl, Sprint 95) : chercher_mails,
 * lire_fil, chercher_todos et l'outil de réponse finale. Retirés : outils
 * CRM (opportunités, collaborations, dossiers marque/créateur/agence) et
 * proposer_actions (l'assistant du package informe, il n'écrit rien).
 * Fabrique PURE : les lectures sont injectées (testable sans Firestore).
 */
const {toMillis, sortThreadChronological} = require("./thread-reader");
const {messageDirection} = require("./message-direction");

const fold = (s) => String(s || "").normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase();
const clampLimit = (v, def, max) => Math.max(1, Math.min(max, Number.isFinite(Number(v)) ? Number(v) : def));
const clip = (s, n) => {
  const t = String(s || "").replace(/\s+/g, " ").trim();
  return t.length > n ? `${t.slice(0, n - 1)}…` : t || undefined;
};
const day = (v) => (toMillis(v) ? new Date(toMillis(v)).toISOString().slice(0, 10) : undefined);
const compact = (o) => Object.fromEntries(Object.entries(o).filter(([, v]) => v !== undefined && v !== null && v !== ""));

const FINAL_TOOL = "repondre";

const MAIL_TOOLS = [
  {
    name: "chercher_mails",
    description: "Cherche dans la boîte (environ 800 derniers e-mails : sujet, expéditeur, destinataires, corps). Résultats regroupés par fil, avec un extrait.",
    input_schema: {
      type: "object",
      properties: {
        texte: {type: "string", description: "Mots à chercher (tous doivent apparaître). Vide = les plus récents."},
        depuis_heures: {type: "number"},
        dossier: {type: "string", enum: ["tous", "reception", "spam", "envoyes"]},
        limite: {type: "number", description: "Nombre de fils, 20 au plus (défaut 10)"},
      },
    },
  },
  {
    name: "lire_fil",
    description: "Lit le contenu d'un fil d'e-mails (8 derniers messages) à partir de son thread_id.",
    input_schema: {type: "object", properties: {thread_id: {type: "string"}}, required: ["thread_id"]},
  },
  {
    name: "chercher_todos",
    description: "Liste les tâches (To-do), par défaut celles non faites. Filtre optionnel sur le texte.",
    input_schema: {type: "object", properties: {texte: {type: "string"}, inclure_faites: {type: "boolean"}}},
  },
  {
    name: FINAL_TOOL,
    description: "RÉPONSE FINALE, toujours par cet outil, une seule fois, en dernier. Texte bref, listes courtes si utile.",
    input_schema: {type: "object", properties: {answer: {type: "string"}}, required: ["answer"]},
  },
];

/**
 * @param {{recentMessages: () => Promise<object[]>, readThread: (id: string) => Promise<object[]>,
 *   loadTodos: () => Promise<object[]>, now?: Date}} deps
 */
function createMailToolbox(deps) {
  const now = deps.now || new Date();
  const words = (q) => fold(q).split(/\s+/).filter((w) => w.length >= 2);
  const inFolder = (m, folder) => {
    const labels = Array.isArray(m.labels) ? m.labels : [];
    if (!folder || folder === "tous") return !labels.includes("TRASH");
    if (folder === "reception") return labels.includes("INBOX");
    if (folder === "spam") return labels.includes("SPAM");
    if (folder === "envoyes") return labels.includes("SENT");
    return true;
  };

  function groupThreads(messages, limit) {
    const byThread = new Map();
    for (const m of messages) {
      const key = m.threadId || m.id;
      const prev = byThread.get(key);
      if (!prev) byThread.set(key, {last: m, count: 1});
      else {
        prev.count += 1;
        if ((toMillis(m.receivedAt) || 0) > (toMillis(prev.last.receivedAt) || 0)) prev.last = m;
      }
    }
    return [...byThread.entries()]
        .sort((a, b) => (toMillis(b[1].last.receivedAt) || 0) - (toMillis(a[1].last.receivedAt) || 0))
        .slice(0, limit)
        .map(([threadId, t]) => compact({
          thread_id: threadId,
          sujet: t.last.subject,
          dernier_mail_le: day(t.last.receivedAt),
          dernier_mail: messageDirection(t.last.labels) === "outbound" ? "envoyé par vous" : "reçu",
          de: t.last.from,
          resume_ia: t.last.analysis?.summary1Line,
          action_attendue: t.last.analysis?.expectedAction,
          messages_trouves: t.count,
          extrait: clip(t.last.bodyText || t.last.snippet, 300),
        }));
  }

  async function searchMails(input = {}) {
    const msgs = await deps.recentMessages();
    const ws = words(input.texte);
    const since = Number(input.depuis_heures) > 0 ? now.getTime() - Number(input.depuis_heures) * 3600000 : null;
    const matched = msgs.filter((m) => {
      if (!inFolder(m, input.dossier)) return false;
      if (since !== null && (toMillis(m.receivedAt) || 0) < since) return false;
      if (!ws.length) return true;
      const hay = fold([m.subject, m.from, (m.to || []).join(" "), m.snippet, m.bodyText, m.analysis?.senderCompany].join(" "));
      return ws.every((w) => hay.includes(w));
    });
    return {mails_trouves: matched.length, fils: groupThreads(matched, clampLimit(input.limite, 10, 20))};
  }

  async function readMailThread(input = {}) {
    const threadId = String(input.thread_id || "");
    if (!threadId) return {erreur: "thread_id manquant"};
    const thread = sortThreadChronological(await deps.readThread(threadId));
    if (!thread.length) return {erreur: "fil introuvable"};
    return {
      thread_id: threadId,
      nombre_de_mails: thread.length,
      mails: thread.slice(-8).map((m) => compact({
        date: day(m.receivedAt),
        sens: messageDirection(m.labels) === "outbound" ? "envoyé par vous" : "reçu",
        de: m.from,
        a: Array.isArray(m.to) ? m.to.join(", ") : m.to,
        sujet: m.subject,
        texte: clip(m.bodyText || m.snippet, 1500),
      })),
    };
  }

  async function searchTodos(input = {}) {
    const todos = (await deps.loadTodos()) || [];
    const q = fold(input.texte);
    const list = todos
        .filter((t) => input.inclure_faites || !(t.todo_kind !== "Récurrent" && t.done))
        .filter((t) => !q || fold(`${t.text} ${t.details || ""}`).includes(q))
        .slice(0, 40)
        .map((t) => compact({
          id: t.id,
          tache: clip(t.text, 120),
          detail: clip(t.details, 160),
          type: t.todo_kind || "Libre",
          echeance: t.todo_kind === "Récurrent" ? undefined : t.due_date,
          periodicite: t.recurrence || undefined,
          premiere_echeance: t.anchor_date || undefined,
          faite: t.done ? true : undefined,
          email_lie: t.source_subject || undefined,
        }));
    return {aujourd_hui: now.toISOString().slice(0, 10), total: list.length, todos: list};
  }

  const handlers = {chercher_mails: searchMails, lire_fil: readMailThread, chercher_todos: searchTodos};
  return {
    async execute(name, input) {
      const h = handlers[name];
      if (!h) throw new Error(`Outil inconnu : ${name}`);
      return h(input || {});
    },
  };
}

module.exports = {MAIL_TOOLS, FINAL_TOOL, createMailToolbox};
