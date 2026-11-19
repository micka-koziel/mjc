/**
 * work-list.js — liste de travail de l'Assistant IA (accueil).
 *
 * ⚠️ RÈGLE PROVISOIRE, à valider avec le porteur du projet (voir
 * docs/SPECIFICATIONS.md, § Priorisation). Elle reprend la mécanique de
 * Trendl (src/features/priorities/lib/daily-priorities.js) SANS ses
 * critères CRM (montant, marque, agence, historique de collaborations,
 * négociation), qui n'existent pas dans le package.
 *
 * Score = poids de la famille
 *       + e-mail : fraîcheur du dernier message reçu (barème Trendl `fresh`)
 *       + e-mail : bonus si l'analyse IA a détecté une action attendue
 *       + e-mail : bonus si l'expéditeur figure parmi les expéditeurs
 *         importants du client (questionnaire, context.importantSenders)
 *       + e-mail : bonus si l'IA l'a jugé prioritaire au regard des règles
 *         du client (priorités et situations à escalader du questionnaire)
 *       + tâche  : retard en jours (barème Trendl agePerDay / ageMax)
 *
 * Familles : « reply » (fil dont le DERNIER message est entrant, en boîte de
 * réception) et « todo » (tâche échue aujourd'hui ou en retard, logique
 * todo-occurrence de Trendl). Les fils où l'on a répondu en dernier, les
 * newsletters et les spams n'entrent pas dans la liste.
 *
 * Toutes les valeurs sont dans PRIORITY_RULES : rien de caché. Module PUR.
 */

import { computeThreadFolder } from '@/features/mailbox/lib/compute-folder';
import { directionOf } from '@/features/mailbox/lib/threads';
import { todoDueState } from '@/features/todos/lib/todo-occurrence';
import { calendarDaysSince } from '@/shared/utils/calendar-days';
import { toMs } from '@/shared/utils/format-date';
import { fold } from '@/shared/utils/text-fold';

export const PRIORITY_RULES = Object.freeze({
  // Poids de base par famille (Trendl, questionnaire S106 : mails à répondre
  // 100, to-do 20).
  familyWeights: { reply: 100, todo: 20 },
  // Fraîcheur d'un e-mail selon l'âge en jours (barème Trendl DEFAULT_RULES.fresh).
  fresh: { d0: 30, d1: 26, d2: 22, d3: 18, d4to7: 10, d8to14: 0, d15to21: -15, d22plus: -35 },
  // Bonus quand l'IA a identifié une action attendue (ajout KHentik, provisoire).
  expectedActionBonus: 15,
  // Bonus : expéditeur important (questionnaire) et priorité détectée par l'IA (règles du client).
  importantSenderBonus: 25,
  urgentBonus: 20,
  // Catégories IA exclues de la liste (information sans action).
  excludedCategories: ['newsletter', 'spam'],
  // Retard d'une tâche : points par jour, plafond (barème Trendl).
  agePerDay: 2,
  ageMax: 20,
  // Nombre maximal d'éléments affichés.
  maxItems: 12,
});

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

/** L'expéditeur figure-t-il dans la liste des expéditeurs importants (nom ou adresse, sans accents ni casse) ? */
export function isImportantSender(from, importantSenders = []) {
  const who = fold(from);
  return Boolean(who) && importantSenders.some((s) => {
    const key = fold(s).trim();
    return key.length >= 3 && who.includes(key);
  });
}

/**
 * @param {{threads: object[], todos: object[], now: number, rules?: object, importantSenders?: string[]}} p
 * @returns {Array<{key: string, kind: 'email'|'todo', score: number, reasons: string[], thread?: object, todo?: object, due?: object}>}
 */
export function buildWorkList({ threads = [], todos = [], now = Date.now(), rules = PRIORITY_RULES, importantSenders = [] }) {
  const items = [];
  const todayISO = new Date(now).toISOString().slice(0, 10);

  for (const thread of threads) {
    if (!threadAwaitsReply(thread, rules)) continue;
    const last = thread.messages[thread.messages.length - 1];
    const ageDays = calendarDaysSince(toMs(last.receivedAt), now);
    const hasAction = Boolean(last.analysis?.expectedAction);
    const important = isImportantSender(last.from, importantSenders);
    const urgent = last.analysis?.urgent === true;
    const score =
      rules.familyWeights.reply +
      freshnessPoints(ageDays, rules) +
      (hasAction ? rules.expectedActionBonus : 0) +
      (important ? rules.importantSenderBonus : 0) +
      (urgent ? rules.urgentBonus : 0);
    const reasons = [ageDays === 0 ? 'reçu aujourd’hui' : ageDays === 1 ? 'reçu hier' : `reçu il y a ${ageDays} j`];
    if (urgent) reasons.push(last.analysis?.urgentReason ? `prioritaire : ${last.analysis.urgentReason}` : 'prioritaire');
    if (important) reasons.push('expéditeur important');
    if (hasAction) reasons.push('action attendue');
    items.push({ key: `email:${thread.threadId}`, kind: 'email', score, reasons, thread, lastMessage: last });
  }

  for (const todo of todos) {
    const due = todoDueState(todo, todayISO);
    if (!due.due) continue;
    const late = Math.min(rules.ageMax, due.daysLate * rules.agePerDay);
    items.push({
      key: `todo:${todo.id}`,
      kind: 'todo',
      score: rules.familyWeights.todo + late,
      reasons: [due.daysLate > 0 ? `en retard de ${due.daysLate} j` : 'à faire aujourd’hui'],
      todo,
      due,
    });
  }

  // Tri : score décroissant, puis le plus récent d'abord à égalité.
  const recency = (i) => (i.kind === 'email' ? toMs(i.lastMessage.receivedAt) || 0 : 0);
  return items.sort((a, b) => b.score - a.score || recency(b) - recency(a)).slice(0, rules.maxItems);
}
