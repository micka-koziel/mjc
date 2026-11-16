/**
 * Tests Vitest (env node) du jeton anti-CSRF OAuth (Sprint 58, Action 4 d'Alex).
 *
 * - Fonctions pures : generateStateToken, isStateFresh.
 * - I/O Firestore : persistState / consumeState testées contre un faux `db`
 *   en mémoire (pas de vrai Firebase).
 */

import { describe, it, expect } from 'vitest';
import {
  generateStateToken,
  isStateFresh,
  persistState,
  consumeState,
  DEFAULT_TTL_MS,
} from './oauth-state.js';

/**
 * Faux Firestore minimal : une Map docId -> data, avec get/set/delete.
 */
function makeFakeDb() {
  const store = new Map();
  return {
    store,
    collection() {
      return {
        doc(id) {
          return {
            async set(data) {
              store.set(id, data);
            },
            async get() {
              const exists = store.has(id);
              return { exists, data: () => store.get(id) };
            },
            async delete() {
              store.delete(id);
            },
          };
        },
      };
    },
  };
}

describe('generateStateToken', () => {
  it('génère un jeton hex de 64 caractères (256 bits)', () => {
    const token = generateStateToken();
    expect(token).toMatch(/^[0-9a-f]{64}$/);
  });

  it('génère un jeton différent à chaque appel', () => {
    expect(generateStateToken()).not.toBe(generateStateToken());
  });
});

describe('isStateFresh', () => {
  const now = 1_000_000_000;

  it('accepte un state récent', () => {
    expect(isStateFresh(now - 1000, now)).toBe(true);
    expect(isStateFresh(now, now)).toBe(true);
  });

  it('rejette un state périmé', () => {
    expect(isStateFresh(now - DEFAULT_TTL_MS - 1, now)).toBe(false);
  });

  it('rejette un state daté du futur (anti-triche)', () => {
    expect(isStateFresh(now + 1000, now)).toBe(false);
  });

  it('rejette une date invalide', () => {
    expect(isStateFresh(undefined, now)).toBe(false);
    expect(isStateFresh(NaN, now)).toBe(false);
  });

  it('respecte un TTL personnalisé', () => {
    expect(isStateFresh(now - 50, now, 100)).toBe(true);
    expect(isStateFresh(now - 150, now, 100)).toBe(false);
  });
});

describe('persistState + consumeState', () => {
  it('un state fraîchement émis est consommé avec succès', async () => {
    const db = makeFakeDb();
    const token = generateStateToken();
    await persistState(db, token, { adminEmail: 'admin@trendl.test' });
    expect(await consumeState(db, token)).toBe(true);
  });

  it('un state est à usage unique (rejeu refusé)', async () => {
    const db = makeFakeDb();
    const token = generateStateToken();
    await persistState(db, token);
    expect(await consumeState(db, token)).toBe(true);
    expect(await consumeState(db, token)).toBe(false); // déjà déchiré
  });

  it('un state inconnu est refusé', async () => {
    const db = makeFakeDb();
    expect(await consumeState(db, 'jeton-bidon')).toBe(false);
  });

  it('un token vide est refusé sans toucher Firestore', async () => {
    const db = makeFakeDb();
    expect(await consumeState(db, '')).toBe(false);
    expect(await consumeState(db, null)).toBe(false);
  });

  it('un state périmé est refusé mais bien supprimé (anti-rejeu)', async () => {
    const db = makeFakeDb();
    const token = generateStateToken();
    await persistState(db, token);
    // On force une date d'émission ancienne dans le faux store.
    db.store.set(token, { created_at: Date.now() - DEFAULT_TTL_MS - 1000 });
    expect(await consumeState(db, token)).toBe(false);
    expect(db.store.has(token)).toBe(false); // supprimé malgré la péremption
  });
});
