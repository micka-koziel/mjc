/**
 * threads.js — regroupement des messages en conversations (fils).
 *
 * Partie PURE de `src/features/mailbox/lib/useMailbox.js` de Trendl
 * (threadKey, directionOf, dedupeThreadMessages, groupByThread,
 * mergeMessagesById), reprise à l'identique. Seule adaptation : les dates
 * passent par `toMs` (nombre en démo, Timestamp Firestore en réel).
 * La lecture Firestore vit désormais dans la couche services.
 */
import { toMs } from '@/shared/utils/format-date';
import { CONTACT_SUBJECT_MARKER } from './resolve-reply-to';


/**
 * Clé de regroupement d'un message en « conversation ».
 *
 * Par défaut = threadId Gmail. EXCEPTION : les notifications du formulaire de
 * contact arrivent toutes du même expéditeur (Resend) avec un sujet quasi
 * identique, donc Gmail les fond dans un seul thread alors qu'elles sont
 * indépendantes. On les force à être chacune leur propre conversation
 * (clé = id du message), pour qu'elles ne s'empilent pas à droite.
 *
 * @param {object} m Message Firestore
 * @returns {string}
 */
export function threadKey(m) {
  if ((m.subject || '').includes(CONTACT_SUBJECT_MARKER)) {
    return m.id;
  }
  return m.threadId || m.id;
}

/**
 * Direction d'affichage d'un message (Sprint 83).
 *
 * Priorité au champ `direction` posé à l'ingestion (nouveaux messages) ;
 * sinon on DÉDUIT depuis les labels Gmail, présents sur tous les messages
 * déjà en base — pas besoin de migration pour que les anciens s'affichent
 * du bon côté. INBOX = entrant (prioritaire) ; SENT sans INBOX = sortant.
 *
 * @param {object} message doc message (direction?, labels?)
 * @returns {"inbound"|"outbound"}
 */
export function directionOf(message) {
  if (message && (message.direction === 'outbound' || message.direction === 'inbound')) {
    return message.direction;
  }
  const labels = message && Array.isArray(message.labels) ? message.labels : [];
  if (labels.includes('INBOX')) return 'inbound';
  if (labels.includes('SENT')) return 'outbound';
  return 'inbound';
}

/**
 * Regroupe les messages STRICTEMENT identiques d'un fil (Sprint 83).
 *
 * Filet de sécurité UX : même après avoir cessé d'ingérer les brouillons,
 * un fil peut contenir des copies identiques (ex. plusieurs envois de test).
 * On garde la 1re occurrence et on compte les copies (`copies`), pour ne
 * jamais réafficher du « spam visuel ». Clé = direction + expéditeur + corps
 * normalisé (500 premiers caractères).
 *
 * @param {object[]} messages messages d'un même fil, déjà triés
 * @returns {object[]} messages dédupliqués, chacun avec un champ `copies`
 */
export function dedupeThreadMessages(messages) {
  if (!Array.isArray(messages)) return [];
  const out = [];
  const index = new Map();
  for (const m of messages) {
    const body = (m.bodyText || m.snippet || '')
      .replace(/\s+/g, ' ')
      .trim()
      .slice(0, 500);
    const subj = (m.subject || '').trim().toLowerCase();
    const key = `${directionOf(m)}|${(m.from || '').toLowerCase()}|${subj}|${body}`;
    if (index.has(key)) {
      const kept = index.get(key);
      kept.copies = (kept.copies || 1) + 1;
    } else {
      const copy = { ...m, copies: 1 };
      index.set(key, copy);
      out.push(copy);
    }
  }
  return out;
}

/**
 * Groupe les messages par threadId Gmail (threading basique).
 * Les messages d'un même thread sont triés par receivedAt asc (chrono).
 * Les threads sont triés par receivedAt du dernier message desc.
 *
 * @param {object[]} messages
 * @returns {Array<{threadId: string, messages: object[], lastReceivedAt: any}>}
 */
export function groupByThread(messages) {
  if (!Array.isArray(messages)) return [];
  const map = new Map();
  // Sprint 83 — on n'affiche jamais les brouillons Gmail dans le fil : ils ne
  // sont plus ingérés, et on filtre aussi les résidus déjà présents en base.
  const visible = messages.filter(
    (m) => !(Array.isArray(m.labels) && m.labels.includes('DRAFT')),
  );
  for (const m of visible) {
    const key = threadKey(m);
    if (!map.has(key)) {
      map.set(key, []);
    }
    map.get(key).push(m);
  }
  const threads = [];
  for (const [threadId, msgs] of map.entries()) {
    const sorted = [...msgs].sort((a, b) => {
      const aMs = toMs(a.receivedAt) || 0;
      const bMs = toMs(b.receivedAt) || 0;
      return aMs - bMs;
    });
    const deduped = dedupeThreadMessages(sorted);
    const last = deduped[deduped.length - 1];
    threads.push({
      threadId,
      messages: deduped,
      lastReceivedAt: last.receivedAt || null,
      lastSubject: last.subject || deduped[0].subject || '(sans sujet)',
      lastFrom: last.from || '',
      lastSnippet: last.snippet || '',
      count: deduped.length,
    });
  }
  threads.sort((a, b) => {
    const aMs = toMs(a.lastReceivedAt) || 0;
    const bMs = toMs(b.lastReceivedAt) || 0;
    return bMs - aMs;
  });
  return threads;
}

/**
 * Fusionne deux jeux de messages en dédupliquant par id. PUR.
 * Les messages du temps réel (onSnapshot) gagnent : ils sont plus frais que
 * la lecture ponctuelle de secours.
 *
 * @param {object[]} live messages du listener temps réel
 * @param {object[]} rescued messages récupérés par lecture ciblée
 * @returns {object[]}
 */
export function mergeMessagesById(live = [], rescued = []) {
  const byId = new Map();
  for (const m of rescued) if (m && m.id) byId.set(m.id, m);
  for (const m of live) if (m && m.id) byId.set(m.id, m);
  return Array.from(byId.values());
}

