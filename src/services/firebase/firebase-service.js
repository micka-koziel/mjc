/**
 * Service RÉEL — Firestore + Cloud Functions (dossier `functions/`).
 *
 * Reprend les appels du front Trendl (mailbox-actions.js,
 * reply-draft-actions.js, useMailbox.js, useMailboxSearch.js, SummaryPanel)
 * avec les mêmes contrats d'API. Différences :
 *  - URLs construites depuis NEXT_PUBLIC_FUNCTIONS_BASE_URL (Trendl : projet
 *    codé en dur) ;
 *  - préférences d'assistant (ton, concision, langue) transmises à la
 *    génération de brouillon ;
 *  - aucun appel CRM (opportunités, fiches, négociations).
 *
 * ⚠️ Écrit et relu sur le code, NON exécuté contre un vrai compte Gmail /
 * Firebase dans l'environnement de construction (voir README, « Limites »).
 */

import {
  addDoc,
  collection,
  deleteDoc,
  doc,
  getDoc,
  getDocs,
  limit,
  onSnapshot,
  orderBy,
  query,
  serverTimestamp,
  updateDoc,
  where,
} from 'firebase/firestore';
import {
  onIdTokenChanged,
  sendEmailVerification,
  sendPasswordResetEmail,
  signInWithEmailAndPassword,
  signOut as fbSignOut,
} from 'firebase/auth';
import { ref as storageRef, uploadBytes } from 'firebase/storage';
import { getFirebase } from './firebase-app';
import { waitForUndo } from '@/shared/utils/undo-send';

const MAX_MESSAGES = 200; // même plafond que la Mailbox Trendl
const THREAD_LIMIT = 100;
const MAX_EXTRA_THREADS = 15;
export const MAX_ATTACHMENT_BYTES = 10 * 1024 * 1024;

function fnUrl(name) {
  const base = process.env.NEXT_PUBLIC_FUNCTIONS_BASE_URL;
  if (!base) throw new Error('NEXT_PUBLIC_FUNCTIONS_BASE_URL manquant (voir .env.example).');
  return `${base.replace(/\/$/, '')}/${name}`;
}

/** Erreur serveur lisible (repris de Trendl, reply-draft-actions.readableError). */
async function readableError(res) {
  const text = await res.text().catch(() => '');
  let data = null;
  try {
    data = JSON.parse(text);
  } catch {
    data = null;
  }
  const err = new Error((data && data.error) || `Action impossible (${res.status}).`);
  err.status = res.status;
  if (data && data.code) err.code = data.code;
  return err;
}

async function call(name, body) {
  const { auth } = getFirebase();
  const user = auth.currentUser;
  if (!user) throw new Error('Non authentifié.');
  const res = await fetch(fnUrl(name), {
    method: 'POST',
    headers: { Authorization: `Bearer ${await user.getIdToken()}`, 'Content-Type': 'application/json' },
    body: JSON.stringify(body || {}),
  });
  if (!res.ok) throw await readableError(res);
  return res.json();
}

const withId = (d) => ({ id: d.id, ...d.data() });

export function createFirebaseService() {
  return {
    mode: 'firebase',

    onAuth(cb) {
      const { auth } = getFirebase();
      // onIdTokenChanged (et non onAuthStateChanged) : prévenu aussi quand le
      // jeton est renouvelé après la vérification de l'adresse e-mail.
      return onIdTokenChanged(auth, (u) =>
        // displayName : le prénom saisi à l'invitation (vide sinon) ; l'adresse reste dans `email`.
        cb(u ? { uid: u.uid, email: u.email, displayName: u.displayName || '', emailVerified: u.emailVerified } : null)
      );
    },
    // Les règles d'accès exigent une adresse vérifiée : envoi du lien, puis
    // relecture du compte (le jeton renouvelé porte la vérification).
    async sendVerificationEmail() {
      const { auth } = getFirebase();
      if (auth.currentUser) await sendEmailVerification(auth.currentUser);
    },
    async refreshVerification() {
      const { auth } = getFirebase();
      if (!auth.currentUser) return false;
      await auth.currentUser.reload();
      await auth.currentUser.getIdToken(true);
      return auth.currentUser.emailVerified;
    },
    // Réglages de l'assistant (functions/settings/assistantSettings.js).
    getAssistantSettings() {
      return call('assistantSettings', { action: 'get' });
    },
    saveAssistantSettings(kind, value) {
      return call('assistantSettings', { action: 'save', kind, value });
    },
    // Accès à l'application (administrateur seulement, voir functions/admin/manageAccess.js).
    manageAccess(action, payload = {}) {
      return call('manageAccess', { action, ...payload });
    },
    // E-mail Firebase « choisir votre mot de passe » : la personne invitée fixe
    // elle-même son mot de passe ; il ne passe jamais par l'administrateur.
    async sendPasswordSetup(email) {
      const { auth } = getFirebase();
      auth.languageCode = 'fr';
      await sendPasswordResetEmail(auth, email);
    },
    // Boîte de démonstration (fonctions déployées avec MAILBOX_PROVIDER=simulated).
    resetDemo() {
      return call('resetDemoMailbox', {});
    },
    async signIn({ email, password }) {
      const { auth } = getFirebase();
      await signInWithEmailAndPassword(auth, email, password);
    },
    async signOut() {
      const { auth } = getFirebase();
      await fbSignOut(auth);
    },

    // Repris de useMailbox (Trendl) : temps réel, 200 derniers messages.
    subscribeMessages(cb) {
      const { db } = getFirebase();
      cb({ messages: [], loading: true, error: null });
      const q = query(collection(db, 'messages'), orderBy('receivedAt', 'desc'), limit(MAX_MESSAGES));
      return onSnapshot(
        q,
        (snap) => cb({ messages: snap.docs.map(withId), loading: false, error: null }),
        (error) => cb({ messages: [], loading: false, error })
      );
    },

    // Repris de useMailboxSearch (Trendl) : Gmail cherche (toutes dates, corps,
    // pièces jointes), puis relecture Firestore des fils trouvés.
    async searchMessages(text) {
      const q = String(text || '').trim();
      if (q.length < 2) return { messages: [] };
      const { db } = getFirebase();
      const { threadIds = [] } = await call('searchMailbox', { q });
      const out = [];
      for (const t of threadIds.slice(0, MAX_EXTRA_THREADS)) {
        const snap = await getDocs(query(collection(db, 'messages'), where('threadId', '==', t), limit(THREAD_LIMIT)));
        out.push(...snap.docs.map(withId));
      }
      return { messages: out };
    },

    applyAction(messageId, action) {
      return call('applyGmailAction', { messageId, action });
    },

    summarizeThread(threadId) {
      return call('summarizeThread', { threadId });
    },

    async getExistingDraft(messageId) {
      const { db } = getFirebase();
      const snap = await getDoc(doc(db, 'message_drafts', messageId));
      return snap.exists() && (snap.data().draft_text || '').trim() ? snap.data() : null;
    },

    generateReplyDraft(messageId, { instruction, assistant } = {}) {
      const body = { messageId, assistant };
      if (instruction && instruction.trim()) body.instruction = instruction.trim();
      return call('generateReplyDraft', body);
    },

    // Repris de uploadReplyAttachment (Trendl) : dépôt dans Storage avant envoi.
    async uploadAttachment(messageId, file) {
      const { storage } = getFirebase();
      if (!file) throw new Error('Aucun fichier sélectionné.');
      if (file.size > MAX_ATTACHMENT_BYTES) throw new Error(`« ${file.name} » dépasse 10 Mo.`);
      const safeName = file.name.replace(/[^\w.\-() ]+/g, '_').slice(0, 120);
      const storagePath = `outgoing_attachments/${messageId}/${Date.now()}-${safeName}`;
      await uploadBytes(storageRef(storage, storagePath), file, { contentType: file.type || 'application/octet-stream' });
      return { storagePath, filename: file.name, sizeBytes: file.size, mimeType: file.type || 'application/octet-stream' };
    },

    // Repris de callSendReplyDraft (Trendl) : 5 s pour annuler, puis envoi Gmail.
    async sendReply({ messageId, text, subject, recipients, cc, bcc, attachments }) {
      await waitForUndo({ label: 'Réponse' });
      return call('sendReplyDraft', {
        messageId,
        draft_text: text,
        subject,
        mode: 'send',
        recipients,
        cc,
        bcc,
        attachments: attachments?.length
          ? attachments.map((a) => ({ storagePath: a.storagePath, filename: a.filename }))
          : undefined,
      });
    },

    summarizeRecent(hours = 12) {
      return call('summarizeRecentEmails', { hours });
    },

    subscribeTodos(cb) {
      const { db } = getFirebase();
      cb({ todos: [], loading: true });
      return onSnapshot(
        query(collection(db, 'todos'), limit(500)),
        (snap) => cb({ todos: snap.docs.map(withId), loading: false }),
        () => cb({ todos: [], loading: false })
      );
    },
    async createTodo(todo) {
      const { db } = getFirebase();
      const ref = await addDoc(collection(db, 'todos'), {
        ...todo,
        created_at: serverTimestamp(),
        updated_at: serverTimestamp(),
      });
      return ref.id;
    },
    async updateTodo(id, patch) {
      const { db } = getFirebase();
      await updateDoc(doc(db, 'todos', id), { ...patch, updated_at: serverTimestamp() });
    },
    async deleteTodo(id) {
      const { db } = getFirebase();
      await deleteDoc(doc(db, 'todos', id));
    },

    // Raccordement technique de la boîte (repris des boutons d'administration
    // Trendl : initOAuth puis startWatch). Pas une rubrique métier.
    async connectMailbox() {
      const { url } = await call('initOAuth', {});
      if (url) window.location.assign(url);
    },
    startReception() {
      return call('startWatch', {});
    },

    async askAssistant({ question, conversationId, assistant }) {
      const data = await call('assistantChat', { question, conversationId, assistant });
      return { conversationId: data.conversationId, text: data.message?.text || '', actions: Array.isArray(data.message?.actions) ? data.message.actions : [] };
    },
  };
}
