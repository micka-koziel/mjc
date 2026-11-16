// Tests repris de Trendl (useMailbox.test.js) sur la partie pure extraite.
import { describe, it, expect } from 'vitest';
import { threadKey, groupByThread, dedupeThreadMessages, directionOf } from './threads';

describe('threadKey (Sprint 29)', () => {
  it('utilise le threadId pour un mail normal', () => {
    expect(threadKey({ id: 'm1', threadId: 't1', subject: 'Coucou' })).toBe(
      't1',
    );
  });

  it('utilise l’id du message pour un mail de formulaire de contact', () => {
    expect(
      threadKey({
        id: 'm1',
        threadId: 't1',
        subject: '[Contact] Marque — X',
      }),
    ).toBe('m1');
  });

  it('fallback sur id si pas de threadId', () => {
    expect(threadKey({ id: 'm1', subject: 'x' })).toBe('m1');
  });
});

describe('groupByThread — formulaires de contact non fusionnés', () => {
  it('sépare deux formulaires du même thread Gmail en 2 conversations', () => {
    const messages = [
      {
        id: 'a',
        threadId: 'shared',
        subject: '[Contact] Marque — Alice',
        receivedAt: { toMillis: () => 1000 },
      },
      {
        id: 'b',
        threadId: 'shared',
        subject: '[Contact] Marque — Bob',
        receivedAt: { toMillis: () => 2000 },
      },
    ];
    const threads = groupByThread(messages);
    expect(threads).toHaveLength(2);
  });

  it('regroupe normalement deux mails d’un vrai fil', () => {
    const messages = [
      {
        id: 'a',
        threadId: 'real',
        subject: 'Devis campagne',
        receivedAt: { toMillis: () => 1000 },
      },
      {
        id: 'b',
        threadId: 'real',
        subject: 'Re: Devis campagne',
        receivedAt: { toMillis: () => 2000 },
      },
    ];
    const threads = groupByThread(messages);
    expect(threads).toHaveLength(1);
    expect(threads[0].count).toBe(2);
  });
});


describe('Sprint 83 — brouillons masqués + copies regroupées', () => {
  it('groupByThread exclut les messages DRAFT', () => {
    const messages = [
      { id: 'a', threadId: 't', subject: 'Devis', bodyText: 'Bonjour',
        receivedAt: { toMillis: () => 1000 } },
      { id: 'd', threadId: 't', subject: 'Devis', bodyText: 'wip',
        labels: ['DRAFT'], receivedAt: { toMillis: () => 2000 } },
    ];
    const threads = groupByThread(messages);
    expect(threads).toHaveLength(1);
    expect(threads[0].count).toBe(1);
  });

  it('dedupeThreadMessages regroupe deux messages strictement identiques', () => {
    const twin = {
      threadId: 't', subject: 'Re: x', from: 'max@trendl.agency',
      direction: 'outbound', bodyText: 'Bonjour Kate',
    };
    const out = dedupeThreadMessages([
      { ...twin, id: '1' },
      { ...twin, id: '2' },
    ]);
    expect(out).toHaveLength(1);
    expect(out[0].copies).toBe(2);
  });

  it('ne fusionne pas deux messages de sujets différents', () => {
    const out = dedupeThreadMessages([
      { id: '1', subject: 'A', from: 'x@y.com', bodyText: '' },
      { id: '2', subject: 'B', from: 'x@y.com', bodyText: '' },
    ]);
    expect(out).toHaveLength(2);
  });
});


describe('directionOf (Sprint 83) — fallback labels', () => {
  it('respecte le champ direction s\'il existe', () => {
    expect(directionOf({ direction: 'outbound', labels: ['INBOX'] })).toBe('outbound');
  });
  it('déduit sortant depuis le label SENT (anciens messages)', () => {
    expect(directionOf({ labels: ['SENT'] })).toBe('outbound');
  });
  it('déduit entrant depuis INBOX (prioritaire)', () => {
    expect(directionOf({ labels: ['INBOX', 'SENT'] })).toBe('inbound');
  });
  it('défaut entrant si rien', () => {
    expect(directionOf({})).toBe('inbound');
  });
});
