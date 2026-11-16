/**
 * todo-occurrence.js — logique PURE des to-do ponctuelles / récurrentes
 * (Sprint 81, réunion cutover 20/07).
 *
 * Aucune I/O, aucune horloge interne : `todayISO` est TOUJOURS injecté par
 * l'appelant (React 19 purity + testabilité). Dates au format 'YYYY-MM-DD',
 * calculs en UTC pour éviter les surprises de fuseau.
 *
 * Modèle anti-dérive : les occurrences d'une to-do récurrente sont calculées
 * depuis l'ANCRE (`anchor_date`) + k pas — jamais en itérant sur le résultat
 * précédent. Ainsi « tous les 31 du mois » redonne bien le 31 en mars même
 * après être passé par le 28 février (clamp ponctuel, pas cumulatif).
 */

import { TODO_RECURRENCES } from './todo-schema';

const DAY_MS = 86400000;

/** Pas en mois par périodicité (Hebdomadaire est géré en jours). */
const RECURRENCE_MONTHS = { Mensuel: 1, Trimestriel: 3, Annuel: 12 };

function parseISO(iso) {
  if (typeof iso !== 'string' || !/^\d{4}-\d{2}-\d{2}/.test(iso)) return null;
  const ms = Date.parse(`${iso.slice(0, 10)}T00:00:00Z`);
  return Number.isNaN(ms) ? null : new Date(ms);
}

function toISO(date) {
  return date.toISOString().slice(0, 10);
}

/** Jours dans un mois (m: 0-11) en UTC. */
function daysInMonth(year, month) {
  return new Date(Date.UTC(year, month + 1, 0)).getUTCDate();
}

/**
 * Ancre + k*months, jour du mois clampé (31 janv + 1 mois → 28/29 févr,
 * mais 31 janv + 2 mois → 31 mars : le clamp ne « colle » pas).
 */
function addMonthsClamped(anchorDate, months) {
  const y = anchorDate.getUTCFullYear();
  const m = anchorDate.getUTCMonth() + months;
  const targetYear = y + Math.floor(m / 12);
  const targetMonth = ((m % 12) + 12) % 12;
  const day = Math.min(anchorDate.getUTCDate(), daysInMonth(targetYear, targetMonth));
  return new Date(Date.UTC(targetYear, targetMonth, day));
}

/**
 * Dernière occurrence <= today (ISO), ou null si l'ancre est future / la
 * config invalide. Expose aussi la prochaine occurrence STRICTEMENT > today.
 * @return {{current: string|null, next: string|null}}
 */
export function occurrencesAround(anchorISO, recurrence, todayISO) {
  const anchor = parseISO(anchorISO);
  const today = parseISO(todayISO);
  if (!anchor || !today || !TODO_RECURRENCES.includes(recurrence) || !recurrence) {
    return { current: null, next: null };
  }
  if (anchor > today) return { current: null, next: toISO(anchor) };

  if (recurrence === 'Quotidien') {
    return { current: toISO(today), next: toISO(new Date(today.getTime() + DAY_MS)) };
  }

  if (recurrence === 'Hebdomadaire') {
    const k = Math.floor((today - anchor) / (7 * DAY_MS));
    const current = new Date(anchor.getTime() + k * 7 * DAY_MS);
    const next = new Date(anchor.getTime() + (k + 1) * 7 * DAY_MS);
    return { current: toISO(current), next: toISO(next) };
  }

  const step = RECURRENCE_MONTHS[recurrence];
  if (!step) return { current: null, next: null };
  // Estimation de k par différence de mois, puis ajustement local (le clamp
  // de fin de mois peut décaler d'un pas).
  const monthDiff =
    (today.getUTCFullYear() - anchor.getUTCFullYear()) * 12 +
    (today.getUTCMonth() - anchor.getUTCMonth());
  let k = Math.max(0, Math.floor(monthDiff / step));
  while (addMonthsClamped(anchor, (k + 1) * step) <= today) k += 1;
  while (k > 0 && addMonthsClamped(anchor, k * step) > today) k -= 1;
  const current = addMonthsClamped(anchor, k * step);
  if (current > today) {
    return { current: null, next: toISO(current) };
  }
  return {
    current: toISO(current),
    next: toISO(addMonthsClamped(anchor, (k + 1) * step)),
  };
}

/** Une fiche `todos` est une to-do CONFIGURÉE (board home) si elle a un type. */
export function isBoardTodo(todo) {
  return Boolean(todo?.todo_kind);
}

/**
 * État d'échéance d'une to-do au jour donné.
 * @param {object} todo fiche todos
 * @param {string} todayISO 'YYYY-MM-DD'
 * @return {{due: boolean, occurrence: string|null, daysLate: number,
 *   next: string|null}}
 *  - due        : la carte doit apparaître sur la home aujourd'hui ;
 *  - occurrence : l'échéance concernée (à solder pour un récurrent) ;
 *  - daysLate   : retard en jours (0 = pile à l'échéance) ;
 *  - next       : prochaine occurrence (récurrent) — pour le sous-titre.
 */
export function todoDueState(todo, todayISO) {
  const none = { due: false, occurrence: null, daysLate: 0, next: null };
  if (!isBoardTodo(todo)) return none;
  const today = parseISO(todayISO);
  if (!today) return none;

  if (todo.todo_kind === 'Ponctuel') {
    if (todo.done) return none;
    const due = parseISO(todo.due_date);
    if (!due || due > today) return none;
    return {
      due: true,
      occurrence: toISO(due),
      daysLate: Math.floor((today - due) / DAY_MS),
      next: null,
    };
  }

  // Récurrent
  const { current, next } = occurrencesAround(
    todo.anchor_date,
    todo.recurrence,
    todayISO
  );
  if (!current) return { ...none, next };
  const alreadyDone =
    typeof todo.last_done_occurrence === 'string' &&
    todo.last_done_occurrence.slice(0, 10) >= current;
  if (alreadyDone) return { ...none, next };
  const currentDate = parseISO(current);
  return {
    due: true,
    occurrence: current,
    daysLate: Math.floor((today - currentDate) / DAY_MS),
    next,
  };
}

/**
 * Champs Firestore à écrire quand Max marque la to-do « fait » aujourd'hui.
 * Ponctuel → soldée définitivement ; récurrent → seule l'occurrence courante
 * est soldée (la carte réapparaîtra à la prochaine occurrence).
 */
export function todoDoneFields(todo, todayISO) {
  if (todo?.todo_kind === 'Récurrent') {
    const { occurrence } = todoDueState(todo, todayISO);
    return { last_done_occurrence: occurrence || todayISO };
  }
  return { done: true };
}
