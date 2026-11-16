import { describe, it, expect } from 'vitest';
import { simulateReplyDraft, simulateThreadSummary, simulateRecentSummary } from './demo-ai';
import { buildDemoMessages } from './demo-data';

const NOW = Date.parse('2026-11-16T12:00:00Z');
const msgs = buildDemoMessages(NOW);
const dupont = msgs.filter((m) => m.threadId === 't-dupont');

describe('IA simulée (démo)', () => {
  it('résume TOUT le fil, pas seulement le dernier message', () => {
    const s = simulateThreadSummary(dupont);
    expect(s.summary).toMatch(/3 messages/);
    expect(s.keyPoints.length).toBe(3);
    expect(s.status).toMatch(/En attente de votre réponse/);
    expect(s.simulated).toBe(true);
  });

  it('indique quand on a répondu en dernier', () => {
    const s = simulateThreadSummary(msgs.filter((m) => m.threadId === 't-transport'));
    expect(s.status).toMatch(/répondu en dernier/);
  });

  it('applique ton, concision, langue et consignes', () => {
    const last = dupont[2];
    const court = simulateReplyDraft(last, { assistant: { concision: 'short' } });
    const long = simulateReplyDraft(last, { assistant: { concision: 'detailed' } });
    expect(court.draft_text.length).toBeLessThan(long.draft_text.length);
    expect(simulateReplyDraft(last, { instruction: 'réponds en anglais' }).draft_text).toMatch(/^Hello|^Dear|^Hi/);
    expect(simulateReplyDraft(last, {}).subject_proposed).toBe('Re: Commande de fin d’année');
    expect(simulateReplyDraft(last, {}).recipient).toBe('jp.dupont@maison-dupont.example');
  });

  it('résumé 12 h : boîte de réception seulement, non triés, fenêtre respectée', () => {
    const r = simulateRecentSummary(msgs, { hours: 12, now: NOW });
    const ids = r.items.map((i) => i.id);
    expect(ids).toContain('m-dupont-3');
    expect(ids).not.toContain('m-spam-1');
    expect(ids).not.toContain('m-petit-1'); // 26 h
  });
});
