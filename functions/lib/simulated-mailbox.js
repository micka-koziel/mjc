/**
 * Boîte de messagerie SIMULÉE — pour une instance de démonstration.
 *
 * Avec MAILBOX_PROVIDER=simulated (functions/.env), aucune fonction ne
 * contacte Gmail : les e-mails viennent d'un jeu fictif propre au client
 * (functions/config/demo-mailbox.json, installé par config:apply), et
 * l'envoi, l'archivage ou la corbeille ne font qu'écrire dans Firestore.
 * L'IA, elle, est réelle. Prépare le branchement d'un autre fournisseur de
 * messagerie (OVH) : seule cette « prise » change, pas le reste.
 *
 * Fonctions PURES (testables) ; l'écriture Firestore est dans
 * demo/resetDemoMailbox.js et les fonctions qui l'appellent.
 */

const MINUTE = 60 * 1000;
const DAY = 24 * 60 * MINUTE;

function isSimulatedMailbox(env = process.env) {
  return String(env.MAILBOX_PROVIDER || "").trim().toLowerCase() === "simulated";
}

/** Effet d'une action sur les libellés, comme Gmail le ferait. */
function simulateLabels(labels = [], action) {
  const set = new Set(labels);
  const remove = (...ls) => ls.forEach((l) => set.delete(l));
  if (action === "trash") {
    remove("INBOX");
    set.add("TRASH");
  } else if (action === "spam") {
    remove("INBOX", "UNREAD");
    set.add("SPAM");
  } else if (action === "archive") {
    remove("INBOX", "UNREAD");
  } else if (action === "mark_read") {
    remove("UNREAD");
  } else {
    throw new Error(`Action simulée inconnue : ${action}`);
  }
  return [...set];
}

function snippetOf(text) {
  return String(text || "").replace(/\s+/g, " ").trim().slice(0, 160);
}

function directionOf(labels = []) {
  return labels.includes("SENT") || labels.includes("DRAFT") ? "outbound" : "inbound";
}

/**
 * Documents à écrire pour (ré)initialiser la boîte de démonstration. Les
 * dates sont relatives à `now`, pour que la démo paraisse toujours « du jour ».
 * @return {{messages: Array<{id: string, doc: object}>, todos: Array<{id: string, doc: object}>}}
 */
function buildSeedDocs(dataset, now = Date.now()) {
  const iso = (ms) => new Date(ms).toISOString().slice(0, 10);
  const messages = (dataset.messages || []).map((m) => {
    const labels = Array.isArray(m.labels) ? m.labels : ["INBOX"];
    return {
      id: m.id,
      doc: {
        gmailId: m.id,
        threadId: m.threadId,
        from: m.from,
        to: m.to || [],
        cc: m.cc || [],
        subject: m.subject || "",
        snippet: snippetOf(m.bodyText),
        bodyText: m.bodyText || "",
        bodyHtml: "",
        labels,
        direction: directionOf(labels),
        attachments: [],
        has_list_unsubscribe: Boolean(m.has_list_unsubscribe),
        app_notification: false,
        reply_to: m.from,
        receivedAtMs: now - Number(m.minutesAgo || 0) * MINUTE,
        simulated: true,
      },
    };
  });
  const todos = (dataset.todos || []).map((t) => {
    const {id, dueInDays, anchorDaysAgo, ...rest} = t;
    const doc = {...rest, created_at_ms: now - 2 * DAY, simulated: true};
    if (dueInDays !== undefined) doc.due_date = iso(now + dueInDays * DAY);
    if (anchorDaysAgo !== undefined) {
      doc.anchor_date = iso(now - anchorDaysAgo * DAY);
      doc.last_done_occurrence = null;
    }
    return {id, doc};
  });
  return {messages, todos};
}

/** Message « envoyé » par la boîte simulée, rangé dans le fil d'origine. */
function buildSentMessage({original, text, subject, recipients, cc, mode, mailboxAddress, now = Date.now()}) {
  const labels = mode === "send" ? ["SENT"] : ["DRAFT"];
  const list = (v) => (Array.isArray(v) ? v.join(",") : String(v || "")).split(/[,;]/).map((s) => s.trim()).filter(Boolean);
  return {
    threadId: original.threadId || null,
    from: mailboxAddress || "Vous <vous@demo.example>",
    to: list(recipients || original.reply_to || original.from),
    cc: list(cc),
    subject,
    snippet: snippetOf(text),
    bodyText: text,
    bodyHtml: "",
    labels,
    direction: "outbound",
    attachments: [],
    has_list_unsubscribe: false,
    app_notification: false,
    receivedAtMs: now,
    simulated: true,
  };
}

/** Recherche plein texte dans les messages (remplace la recherche Gmail). */
function searchSimulated(messages, query, max = 25) {
  const fold = (s) => String(s || "").normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase();
  const terms = fold(query).split(/\s+/).filter((t) => t.length >= 2);
  if (!terms.length) return [];
  const ids = [];
  for (const m of messages) {
    const hay = fold([m.from, (m.to || []).join(" "), m.subject, m.bodyText].join(" "));
    if (terms.every((t) => hay.includes(t)) && m.threadId && !ids.includes(m.threadId)) ids.push(m.threadId);
    if (ids.length >= max) break;
  }
  return ids;
}

/** Jeu de démonstration installé avec les fonctions (null si absent). */
function loadDemoDataset() {
  try {
    // eslint-disable-next-line global-require
    return require("../config/demo-mailbox.json");
  } catch (err) {
    return null;
  }
}

module.exports = {isSimulatedMailbox, simulateLabels, buildSeedDocs, buildSentMessage, searchSimulated, loadDemoDataset};
