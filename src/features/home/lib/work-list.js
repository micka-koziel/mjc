/**
 * work-list.js — liste de travail de l'Assistant IA (accueil).
 *
 * Mécanique reprise de Trendl (src/features/priorities/lib/daily-priorities.js)
 * SANS ses critères CRM (montant, marque, agence, historique, négociation).
 * Tous les paramètres sont RÉGLABLES par l'utilisatrice (écran Réglages,
 * features/settings) : aucune règle cachée.
 *
 * Score d'un e-mail = poids « e-mails à répondre »
 *       + fraîcheur du dernier message reçu (barème par âge)
 *       + bonus si l'IA a détecté une action attendue
 *       + bonus si l'IA l'a jugé prioritaire selon les consignes du client
 *       + poids du niveau de l'expéditeur (stratégique, important, bas de liste)
 *       + bonus si l'objet ou le texte contient un mot-clé prioritaire
 * Score d'une tâche = poids « tâches » + retard (points par jour, plafonné).
 *
 * Les fils où l'on a répondu en dernier et les catégories exclues (par
 * défaut : newsletters, spam) n'entrent pas dans la liste. Module PUR.
 */

import { computeThreadFolder } from '@/features/mailbox/lib/compute-folder';
import { directionOf } from '@/features/mailbox/lib/threads';
import { todoDueState } from '@/features/todos/lib/todo-occurrence';
import { calendarDaysSince } from '@/shared/utils/calendar-days';
import { toMs } from '@/shared/utils/format-date';
import { fold } from '@/shared/utils/text-fold';
import { DEFAULT_PRIORITIES, SENDER_LEVELS, normalizePriorities } from '@/features/settings/lib/assistant-settings';

/** Barème par défaut (compatibilité : ancien nom). */
export const PRIORITY_RULES = Object.freeze(normalizePriorities(DEFAULT_PRIORITIES));

export function freshnessPoints(ageDays, rules = PRIORITY_RULES) {
  if (ageDays === null || ageDays === undefined) return 0;
  const f = rules.fresh;
  const d = Math.max(0, ageDays);
  if (d === 0) return f.d0;
  if (d === 1) return f.d1;
  if (d === 2) return f.d2;
  if (d === 3) return f.d3;
  if (d <= 7) return f.d4to7;
  if (d <= 14) return f.d8to14;
  if (d <= 21) return f.d15to21;
  return f.d22plus;
}

/** Le fil attend-il une réponse de notre part ? */
export function threadAwaitsReply(thread, rules = PRIORITY_RULES) {
  const msgs = thread?.messages || [];
  if (!msgs.length) return false;
  if (computeThreadFolder(msgs) !== 'inbox') return false;
  const last = msgs[msgs.length - 1];
  if (directionOf(last) !== 'inbound') return false;
  if (rules.excludedCategories.includes(last.analysis?.category)) return false;
  return true;
}

/**
 * Niveau de l'expéditeur : la règle la plus favorable parmi celles qui
 * correspondent (nom, entreprise ou adresse, sans accents ni casse).
 * @returns {{level: string, weight: number}|null}
 */
export function senderLevel(from, rules = PRIORITY_RULES) {
  const who = fold(from);
  if (!who) return null;
  let best = null;
  for (const s of rules.senders) {
    const key = fold(s.match).trim();
    if (key.length < 3 || !who.includes(key)) continue;
    const weight = rules.levelWeights[s.level] ?? 0;
    if (!best || weight > best.weight) best = { level: s.level, weight };
  }
  return best;
}

/** Compatibilité : expéditeur « important » d'une simple liste. */
export function isImportantSender(from, importantSenders = []) {
  return Boolean(senderLevel(from, { senders: importantSenders.map((match) => ({ match, level: 'important' })), levelWeights: { important: 1 } }));
}

/** Premier mot-clé prioritaire trouvé dans l'objet ou le texte du message. */
export function matchedKeyword(message, rules = PRIORITY_RULES) {
  const hay = fold(`${message?.subject || ''} ${message?.bodyText || message?.snippet || ''}`);
  return rules.keywords.find((k) => k.length >= 3 && hay.includes(fold(k))) || null;
}

const LEVEL_LABEL = Object.fromEntries(SENDER_LEVELS.map((l) => [l.key, l.label.toLowerCase()]));

/**
 * @param {{threads: object[], todos: object[], now: number, rules?: object, importantSenders?: string[]}} p
 *   rules : réglages normalisés (normalizePriorities) ; importantSenders :
 *   ancienne liste simple, ajoutée en niveau « important ».
 */
export function buildWorkList({ threads = [], todos = [], now = Date.now(), rules = PRIORITY_RULES, importantSenders = [] }) {
  const r = importantSenders.length
    ? { ...rules, senders: [...rules.senders, ...importantSenders.map((match) => ({ match, level: 'important' }))] }
    : rules;
  const items = [];
  const todayISO = new Date(now).toISOString().slice(0, 10);

  for (const thread of threads) {
    if (!threadAwaitsReply(thread, r)) continue;
    const last = thread.messages[thread.messages.length - 1];
    const ageDays = calendarDaysSince(toMs(last.receivedAt), now);
    const hasAction = Boolean(last.analysis?.expectedAction);
    const urgent = last.analysis?.urgent === true;
    const level = senderLevel(last.from, r);
    const keyword = matchedKeyword(last, r);
    const score =
      r.familyWeights.reply +
      freshnessPoints(ageDays, r) +
      (hasAction ? r.expectedActionBonus : 0) +
      (urgent ? r.urgentBonus : 0) +
      (level ? level.weight : 0) +
      (keyword ? r.keywordBonus : 0);
    const reasons = [ageDays === 0 ? 'reçu aujourd’hui' : ageDays === 1 ? 'reçu hier' : `reçu il y a ${ageDays} j`];
    if (urgent) reasons.push(last.analysis?.urgentReason ? `prioritaire : ${last.analysis.urgentReason}` : 'prioritaire');
    if (level) reasons.push(`expéditeur ${LEVEL_LABEL[level.level] || level.level}`);
    if (keyword) reasons.push(`mot-clé « ${keyword} »`);
    if (hasAction) reasons.push('action attendue');
    items.push({ key: `email:${thread.threadId}`, kind: 'email', score, reasons, thread, lastMessage: last });
  }

  for (const todo of todos) {
    const due = todoDueState(todo, todayISO);
    if (!due.due) continue;
    const late = Math.min(r.ageMax, due.daysLate * r.agePerDay);
    items.push({
      key: `todo:${todo.id}`,
      kind: 'todo',
      score: r.familyWeights.todo + late,
      reasons: [due.daysLate > 0 ? `en retard de ${due.daysLate} j` : 'à faire aujourd’hui'],
      todo,
      due,
    });
  }

  // Tri : score décroissant, puis le plus récent d'abord à égalité.
  const recency = (i) => (i.kind === 'email' ? toMs(i.lastMessage.receivedAt) || 0 : 0);
  return items.sort((a, b) => b.score - a.score || recency(b) - recency(a)).slice(0, r.maxItems);
}
