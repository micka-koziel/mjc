/**
 * compute-folder.js — Mapping labels Gmail → folder côté UI Mailbox.
 *
 * ingestEmail.js (Sprint 10) stocke déjà `labels: msg.labelIds || []` dans
 * Firestore pour chaque message ingéré. Les labels Gmail standards sont :
 *   - INBOX  → boîte de réception (par défaut)
 *   - SPAM   → spam
 *   - SENT   → envoyé
 *   - TRASH  → corbeille
 *   - DRAFT  → brouillon
 *
 * Règles V1 Sprint 20 :
 *   - Si labels contient TRASH → folder = 'trash'
 *   - Sinon si labels contient SPAM → folder = 'spam'
 *   - Sinon si labels contient SENT → folder = 'sent'
 *   - Sinon si labels contient INBOX → folder = 'inbox'
 *   - Sinon → folder = 'archive' (= ni inbox ni spam ni sent ni trash)
 *
 * Note : un même message peut techniquement avoir INBOX + SPAM si l'utilisateur
 * a marqué comme spam manuellement sans vider. On privilégie SPAM dans ce cas.
 */

const FOLDER_TRASH = 'trash';
const FOLDER_SPAM = 'spam';
const FOLDER_SENT = 'sent';
const FOLDER_INBOX = 'inbox';
const FOLDER_ARCHIVE = 'archive';

export const MAILBOX_FOLDERS = [
  { id: FOLDER_INBOX, label: 'Boîte de réception' },
  { id: FOLDER_SPAM, label: 'Spam' },
  { id: FOLDER_ARCHIVE, label: 'Archive' },
  { id: FOLDER_SENT, label: 'Envoyés' },
  { id: FOLDER_TRASH, label: 'Corbeille' },
];

/**
 * Retourne l'id du folder UI pour un message Firestore.
 *
 * @param {object} message Document Firestore /messages/{id}
 * @param {string[]} [message.labels] Labels Gmail stockés à l'ingestion
 * @returns {'inbox'|'spam'|'sent'|'trash'|'archive'}
 */
export function computeFolder(message) {
  if (!message || !Array.isArray(message.labels)) {
    return FOLDER_ARCHIVE;
  }
  const labels = message.labels;
  if (labels.includes('TRASH')) return FOLDER_TRASH;
  if (labels.includes('SPAM')) return FOLDER_SPAM;
  if (labels.includes('SENT')) return FOLDER_SENT;
  if (labels.includes('INBOX')) return FOLDER_INBOX;
  return FOLDER_ARCHIVE;
}

/**
 * Filtre une liste de messages pour ne garder que ceux d'un folder donné.
 *
 * @param {Array<object>} messages
 * @param {string} folderId
 * @returns {Array<object>}
 */
export function filterByFolder(messages, folderId) {
  if (!Array.isArray(messages)) return [];
  if (!folderId) return messages;
  return messages.filter((m) => computeFolder(m) === folderId);
}

/**
 * Compte les messages par folder. Utile pour le badge count dans la nav.
 *
 * @param {Array<object>} messages
 * @returns {Record<string, number>}
 */
export function countByFolder(messages) {
  const counts = {
    [FOLDER_INBOX]: 0,
    [FOLDER_SPAM]: 0,
    [FOLDER_SENT]: 0,
    [FOLDER_TRASH]: 0,
    [FOLDER_ARCHIVE]: 0,
  };
  if (!Array.isArray(messages)) return counts;
  for (const m of messages) {
    const f = computeFolder(m);
    counts[f] = (counts[f] || 0) + 1;
  }
  return counts;
}

/**
 * Sprint 82.2 — Dossier d'une CONVERSATION (liste de messages ordonnée du
 * plus ancien au plus récent).
 *
 * Règle produit (Mickaël, session GoLive 22/07) : un email REÇU reste dans
 * l'Inbox quoi qu'il arrive autour (brouillon IA, réponse envoyée,
 * opportunité créée). Avant ce fix, le dossier du fil = dossier de son
 * DERNIER message : un brouillon Gmail (DRAFT, ingéré par le watch) ou une
 * réponse (SENT) éjectait toute la conversation de l'Inbox.
 *
 * Nouvelle règle : le dossier du fil = dossier de son dernier message
 * ENTRANT (ni DRAFT ni SENT). S'il n'y a aucun message entrant (fil
 * composé uniquement de brouillons/envois, ex. prospection sortante),
 * repli sur le dernier message — comportement historique.
 *
 * @param {Array<object>} messages Messages du fil, du plus ancien au plus récent
 * @returns {'inbox'|'spam'|'sent'|'trash'|'archive'}
 */
export function computeThreadFolder(messages) {
  if (!Array.isArray(messages) || messages.length === 0) {
    return FOLDER_ARCHIVE;
  }
  for (let i = messages.length - 1; i >= 0; i--) {
    const labels = Array.isArray(messages[i]?.labels) ? messages[i].labels : [];
    const isOutbound = labels.includes('DRAFT') || labels.includes('SENT');
    if (!isOutbound) return computeFolder(messages[i]);
  }
  return computeFolder(messages[messages.length - 1]);
}

/**
 * Sprint 82.2 — Compte les CONVERSATIONS par dossier (même règle que la
 * liste affichée). Avant : compte par MESSAGE → le badge du menu annonçait
 * « 3 » quand la liste montrait 1 conversation. Le badge et la liste
 * utilisent désormais exactement la même unité et la même règle.
 *
 * @param {Array<{messages: Array<object>}>} threads
 * @returns {Record<string, number>}
 */
export function countThreadsByFolder(threads) {
  const counts = {
    [FOLDER_INBOX]: 0,
    [FOLDER_SPAM]: 0,
    [FOLDER_SENT]: 0,
    [FOLDER_TRASH]: 0,
    [FOLDER_ARCHIVE]: 0,
  };
  if (!Array.isArray(threads)) return counts;
  for (const t of threads) {
    const f = computeThreadFolder(t?.messages);
    counts[f] = (counts[f] || 0) + 1;
  }
  return counts;
}

export const MAILBOX_FOLDER_IDS = {
  INBOX: FOLDER_INBOX,
  SPAM: FOLDER_SPAM,
  SENT: FOLDER_SENT,
  TRASH: FOLDER_TRASH,
  ARCHIVE: FOLDER_ARCHIVE,
};
