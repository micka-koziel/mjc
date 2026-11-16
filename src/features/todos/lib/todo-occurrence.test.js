/**
 * Tests todo-occurrence — Sprint 81 (to-do récurrentes, réunion 20/07).
 * Logique pure : today est injecté, zéro horloge interne.
 */

import { describe, it, expect } from 'vitest';
import {
  occurrencesAround,
  todoDueState,
  todoDoneFields,
  isBoardTodo,
} from './todo-occurrence';

describe('occurrencesAround', () => {
  it('mensuel ancré au 1ᵉʳ : occurrence courante = le 1ᵉʳ du mois en cours', () => {
    const r = occurrencesAround('2026-01-01', 'Mensuel', '2026-07-20');
    expect(r.current).toBe('2026-07-01');
    expect(r.next).toBe('2026-08-01');
  });

  it('ancre future : pas d’occurrence courante, next = ancre', () => {
    const r = occurrencesAround('2026-09-01', 'Mensuel', '2026-07-20');
    expect(r.current).toBeNull();
    expect(r.next).toBe('2026-09-01');
  });

  it('mensuel ancré au 31 : clamp février SANS dérive (31 mars ensuite)', () => {
    expect(occurrencesAround('2026-01-31', 'Mensuel', '2026-02-28').current).toBe('2026-02-28');
    expect(occurrencesAround('2026-01-31', 'Mensuel', '2026-03-31').current).toBe('2026-03-31');
  });

  it('hebdomadaire : pas de 7 jours depuis l’ancre', () => {
    const r = occurrencesAround('2026-07-06', 'Hebdomadaire', '2026-07-20');
    expect(r.current).toBe('2026-07-20');
    expect(r.next).toBe('2026-07-27');
  });

  it('trimestriel et annuel', () => {
    expect(occurrencesAround('2026-01-15', 'Trimestriel', '2026-07-20').current).toBe('2026-07-15');
    expect(occurrencesAround('2025-03-01', 'Annuel', '2026-07-20').current).toBe('2026-03-01');
  });

  it('config invalide → null (pas de crash)', () => {
    expect(occurrencesAround(null, 'Mensuel', '2026-07-20').current).toBeNull();
    expect(occurrencesAround('2026-01-01', 'Bizarre', '2026-07-20').current).toBeNull();
  });
});

describe('todoDueState', () => {
  it('to-do à la volée (sans todo_kind, drawer S50) : jamais sur le board', () => {
    expect(isBoardTodo({ text: 'relancer Samsung', due_date: '2026-07-01' })).toBe(false);
    expect(
      todoDueState({ text: 'x', due_date: '2026-07-01' }, '2026-07-20').due
    ).toBe(false);
  });

  it('ponctuel : due à l’échéance et tant que pas fait, avec retard compté', () => {
    const t = { todo_kind: 'Ponctuel', due_date: '2026-07-15' };
    const s = todoDueState(t, '2026-07-20');
    expect(s.due).toBe(true);
    expect(s.daysLate).toBe(5);
    expect(todoDueState({ ...t, done: true }, '2026-07-20').due).toBe(false);
    expect(todoDueState(t, '2026-07-10').due).toBe(false);
  });

  it('récurrent : due sur l’occurrence courante non soldée, réapparaît ensuite', () => {
    const t = {
      todo_kind: 'Récurrent',
      recurrence: 'Mensuel',
      anchor_date: '2026-01-01',
    };
    // Occurrence du 1er juillet pas soldée → due le 20/07 (19 j de retard).
    const s = todoDueState(t, '2026-07-20');
    expect(s).toMatchObject({ due: true, occurrence: '2026-07-01', daysLate: 19 });
    // Soldée pour juillet → plus due, next = 1er août.
    const done = { ...t, last_done_occurrence: '2026-07-01' };
    const s2 = todoDueState(done, '2026-07-20');
    expect(s2.due).toBe(false);
    expect(s2.next).toBe('2026-08-01');
    // … et re-due le 1er août (l'occurrence d'août n'est pas soldée).
    expect(todoDueState(done, '2026-08-01')).toMatchObject({
      due: true,
      occurrence: '2026-08-01',
    });
  });
});

describe('todoDoneFields', () => {
  it('ponctuel → done définitif ; récurrent → solde la seule occurrence courante', () => {
    expect(todoDoneFields({ todo_kind: 'Ponctuel' }, '2026-07-20')).toEqual({
      done: true,
    });
    expect(
      todoDoneFields(
        { todo_kind: 'Récurrent', recurrence: 'Mensuel', anchor_date: '2026-01-01' },
        '2026-07-20'
      )
    ).toEqual({ last_done_occurrence: '2026-07-01' });
  });
});

describe('Quotidien (Sprint 95)', () => {
  it('occurrence = aujourd’hui, prochaine = demain', async () => {
    const { occurrencesAround } = await import('./todo-occurrence');
    expect(occurrencesAround('2026-10-01', 'Quotidien', '2026-10-11')).toEqual({ current: '2026-10-11', next: '2026-10-12' });
    expect(occurrencesAround('2026-10-20', 'Quotidien', '2026-10-11')).toEqual({ current: null, next: '2026-10-20' });
  });
});
