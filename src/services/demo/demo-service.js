/**
 * Service de DÉMONSTRATION — données fictives, IA simulée, aucun envoi réel.
 *
 * L'état (mails, brouillons, tâches) vit en mémoire et est mémorisé dans le
 * navigateur (localStorage) pour survivre à un rechargement pendant une
 * présentation. « Réinitialiser la démo » repart du jeu d'origine.
 * Les actions (corbeille, spam, envoi) modifient UNIQUEMENT cette copie locale.
 */

import { buildDemoMessages, buildDemoTodos, DEMO_USER } from './demo-data';
import { simulateRecentSummary, simulateReplyDraft, simulateThreadSummary } from './demo-ai';
import { fold } from '@/shared/utils/text-fold';
import { toMs } from '@/shared/utils/format-date';
import { waitForUndo } from '@/shared/utils/undo-send';

const STORAGE_KEY = 'khentik.demo.state.v1';
const LATENCY = 450; // ms — rend perceptibles les états « chargement »

const wait = (ms = LATENCY) => new Promise((r) => setTimeout(r, ms));

function freshState() {
  const now = Date.now();
  return { messages: buildDemoMessages(now), todos: buildDemoTodos(now), drafts: {}, seq: 1 };
}

function load() {
  try {
    const raw = typeof window !== 'undefined' && window.localStorage.getItem(STORAGE_KEY);
    if (raw) {
      const parsed = JSON.parse(raw);
      if (Array.isArray(parsed.messages) && Array.isArray(parsed.todos)) return parsed;
    }
  } catch {
    /* stockage indisponible : on repart du jeu d'origine */
  }
  return freshState();
}

export function createDemoService({ initialState } = {}) {
  let state = initialState || load();
  const msgSubs = new Set();
  const todoSubs = new Set();
  const authSubs = new Set();
  let user = DEMO_USER;

  function persist() {
    try {
      if (typeof window !== 'undefined') window.localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
    } catch {
      /* quota ou navigation privée : la démo continue en mémoire */
    }
  }
  function emitMessages() {
    const snapshot = { messages: [...state.messages], loading: false, error: null };
    msgSubs.forEach((cb) => cb(snapshot));
  }
  function emitTodos() {
    const snapshot = { todos: [...state.todos], loading: false };
    todoSubs.forEach((cb) => cb(snapshot));
  }
  function patchMessage(id, fn) {
    state = { ...state, messages: state.messages.map((m) => (m.id === id ? fn(m) : m)) };
    persist();
    emitMessages();
  }
  const findMessage = (id) => state.messages.find((m) => m.id === id);

  return {
    mode: 'demo',

    onAuth(cb) {
      authSubs.add(cb);
      cb(user);
      return () => authSubs.delete(cb);
    },
    async signIn() {
      user = DEMO_USER;
      authSubs.forEach((cb) => cb(user));
    },
    async signOut() {
      user = null;
      authSubs.forEach((cb) => cb(user));
    },

    subscribeMessages(cb) {
      msgSubs.add(cb);
      cb({ messages: [...state.messages], loading: false, error: null });
      return () => msgSubs.delete(cb);
    },

    async searchMessages(query) {
      await wait(250);
      const q = fold(query);
      if (q.length < 2) return { messages: [] };
      return {
        messages: state.messages.filter((m) =>
          fold([m.from, m.subject, m.bodyText, ...(m.attachments || []).map((a) => a.filename)].join(' ')).includes(q)
        ),
      };
    },

    // Même sémantique que la Cloud Function applyGmailAction de Trendl.
    async applyAction(messageId, action) {
      await wait(200);
      if (!findMessage(messageId)) throw new Error('Message introuvable.');
      const TRIAGE = { trash: 'trash', spam: 'spam', archive: 'ignored' };
      patchMessage(messageId, (m) => {
        let labels = [...(m.labels || [])];
        if (action === 'trash') labels = [...labels.filter((l) => l !== 'INBOX' && l !== 'SPAM'), 'TRASH'];
        else if (action === 'spam') labels = [...labels.filter((l) => l !== 'INBOX'), 'SPAM'];
        else if (action === 'archive') labels = labels.filter((l) => l !== 'INBOX');
        else if (action === 'mark_read') labels = labels.filter((l) => l !== 'UNREAD');
        else throw new Error(`Action inconnue : ${action}`);
        return {
          ...m,
          labels,
          ...(TRIAGE[action] ? { triaged_at: Date.now(), triage_reason: TRIAGE[action] } : {}),
        };
      });
      return { ok: true, simulated: true };
    },

    async summarizeThread(threadId, messages) {
      await wait();
      const list = messages?.length ? messages : state.messages.filter((m) => m.threadId === threadId);
      return simulateThreadSummary(list);
    },

    async getExistingDraft(messageId) {
      return state.drafts[messageId] || null;
    },

    async generateReplyDraft(messageId, { instruction, assistant } = {}) {
      await wait(900);
      const m = findMessage(messageId);
      if (!m) throw new Error('Message introuvable.');
      const draft = simulateReplyDraft(m, { instruction, assistant, senderName: user?.displayName });
      state = { ...state, drafts: { ...state.drafts, [messageId]: draft } };
      persist();
      return draft;
    },

    async uploadAttachment(messageId, file) {
      await wait(300);
      // Démo : le fichier ne quitte pas le navigateur.
      return {
        storagePath: `demo/${messageId}/${Date.now()}-${file.name}`,
        filename: file.name,
        sizeBytes: file.size,
        mimeType: file.type || 'application/octet-stream',
      };
    },

    async sendReply({ messageId, text, subject, recipients, cc, bcc, attachments }) {
      // Même délai d'annulation que le mode réel (Trendl, Sprint 107.1 : 5 s).
      await waitForUndo({ label: 'Réponse (démo)' });
      await wait();
      const source = findMessage(messageId);
      if (!source) throw new Error('Message introuvable.');
      const id = `demo-sent-${state.seq}`;
      const sent = {
        id,
        threadId: source.threadId,
        from: `${user.displayName} <${user.email}>`,
        to: String(recipients || '').split(',').map((s) => s.trim()).filter(Boolean),
        cc: String(cc || '').split(',').map((s) => s.trim()).filter(Boolean),
        bcc: String(bcc || '').split(',').map((s) => s.trim()).filter(Boolean),
        subject,
        bodyText: text,
        snippet: text.replace(/\s+/g, ' ').slice(0, 140),
        labels: ['SENT'],
        direction: 'outbound',
        receivedAt: Date.now(),
        attachments: (attachments || []).map((a) => ({ filename: a.filename, size: a.sizeBytes || 0 })),
        analysis: { status: 'completed', category: 'info', summary1Line: `Vous avez répondu : « ${text.replace(/\s+/g, ' ').slice(0, 90)}… »` },
        simulated: true,
      };
      const drafts = { ...state.drafts };
      delete drafts[messageId];
      state = { ...state, seq: state.seq + 1, drafts, messages: [...state.messages, sent] };
      persist();
      emitMessages();
      return { ok: true, simulated: true, gmailId: id, threadId: source.threadId };
    },

    async summarizeRecent(hours = 12) {
      await wait(900);
      return simulateRecentSummary(state.messages, { hours });
    },

    subscribeTodos(cb) {
      todoSubs.add(cb);
      cb({ todos: [...state.todos], loading: false });
      return () => todoSubs.delete(cb);
    },
    async createTodo(todo) {
      const id = `todo-${Date.now()}`;
      state = { ...state, todos: [...state.todos, { ...todo, id, created_at: Date.now() }] };
      persist();
      emitTodos();
      return id;
    },
    async updateTodo(id, patch) {
      state = { ...state, todos: state.todos.map((t) => (t.id === id ? { ...t, ...patch } : t)) };
      persist();
      emitTodos();
    },
    async deleteTodo(id) {
      state = { ...state, todos: state.todos.filter((t) => t.id !== id) };
      persist();
      emitTodos();
    },

    async askAssistant({ question }) {
      await wait(700);
      return { conversationId: 'demo', text: demoAnswer(question, state.messages), simulated: true };
    },

    // Réglages de l'assistant (démo : gardés dans le navigateur).
    async getAssistantSettings() {
      await wait(150);
      return { priorities: state.settings?.priorities || null, replies: state.settings?.replies || null, defaults: {} };
    },
    async saveAssistantSettings(kind, value) {
      await wait();
      state = { ...state, settings: { ...(state.settings || {}), [kind]: value } };
      persist();
      return { ok: true, value };
    },

    resetDemo() {
      state = freshState();
      persist();
      emitMessages();
      emitTodos();
    },
  };
}

/**
 * Réponse libre du chat en DÉMO : quelques intentions reconnues, sinon on le
 * dit franchement (pas de fausse IA générative).
 */
export function demoAnswer(question, messages) {
  const q = fold(question);
  const fromMatch = /(?:mails?|messages?|e-mails?) (?:de|d')\s*(.+)$/.exec(q);
  if (fromMatch) {
    const who = fromMatch[1].trim();
    const found = messages
      .filter((m) => fold(`${m.from} ${m.analysis?.senderCompany || ''}`).includes(who))
      .sort((a, b) => toMs(b.receivedAt) - toMs(a.receivedAt));
    if (!found.length) return `Je ne trouve aucun e-mail de « ${fromMatch[1]} » dans la boîte de démonstration.`;
    return [
      `${found.length} e-mail${found.length > 1 ? 's' : ''} trouvé${found.length > 1 ? 's' : ''} :`,
      ...found.slice(0, 5).map((m) => `• ${m.subject} — ${m.analysis?.summary1Line || m.snippet}`),
    ].join('\n');
  }
  return (
    'Mode démonstration : je réponds aux commandes rapides (résumé des 12 dernières heures, spams, ' +
    'e-mails en attente de réponse, tâches du jour) et aux recherches du type « mails de Dupont ». ' +
    'Les questions libres sont traitées par l’IA en mode réel.'
  );
}
