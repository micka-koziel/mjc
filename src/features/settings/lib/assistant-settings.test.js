import { describe, it, expect } from 'vitest';
import { DEFAULT_PRIORITIES, normalizePriorities, normalizeReplies } from './assistant-settings';

describe('réglages de l’assistant', () => {
  it('complète des réglages vides avec le barème par défaut et les valeurs de l’instance', () => {
    const p = normalizePriorities({}, { senders: [{ match: 'Annie Do', level: 'important' }], aiRules: 'Réclamations' });
    expect(p.fresh).toEqual(DEFAULT_PRIORITIES.fresh);
    expect(p.senders).toEqual([{ match: 'annie do', level: 'important' }]);
    expect(p.aiRules).toBe('Réclamations');
  });
  it('les réglages enregistrés priment, même vides', () => {
    const p = normalizePriorities({ senders: [], aiRules: '' }, { senders: [{ match: 'annie do' }], aiRules: 'x' });
    expect(p.senders).toEqual([]);
    expect(p.aiRules).toBe('');
  });
  it('borne et nettoie les valeurs abîmées', () => {
    const p = normalizePriorities({
      urgentBonus: 'beaucoup',
      expectedActionBonus: 9999,
      maxItems: 1,
      senders: [{ match: 'ab', level: 'important' }, { match: 'Bastien', level: 'roi' }],
      keywords: ['ok', ' Réclamation '],
      excludedCategories: ['spam', 'inconnue'],
    });
    expect(p.urgentBonus).toBe(DEFAULT_PRIORITIES.urgentBonus);
    expect(p.expectedActionBonus).toBe(200);
    expect(p.maxItems).toBe(3);
    expect(p.senders).toEqual([{ match: 'bastien', level: 'important' }]);
    expect(p.keywords).toEqual(['réclamation']);
    expect(p.excludedCategories).toEqual(['spam']);
  });
  it('réponses : valeurs connues seulement, textes conservés', () => {
    const r = normalizeReplies({ tone: 'agressif', formality: 'tu', signatureText: ' Carine ' }, { tone: 'direct' });
    expect(r).toMatchObject({ tone: 'direct', formality: 'tu', signatureText: 'Carine', concision: 'balanced' });
  });
});
