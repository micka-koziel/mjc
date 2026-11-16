/**
 * Tests Vitest (env node) — dead-letter.js (Sprint 68, M04-R3).
 */

import { describe, it, expect } from 'vitest';
import {
  shouldQuarantine,
  recordPoisonAttempt,
  MAX_ATTEMPTS,
} from './dead-letter.js';

describe('shouldQuarantine (décision pure)', () => {
  it('met en quarantaine à partir du seuil', () => {
    expect(shouldQuarantine(MAX_ATTEMPTS - 1)).toBe(false);
    expect(shouldQuarantine(MAX_ATTEMPTS)).toBe(true);
    expect(shouldQuarantine(MAX_ATTEMPTS + 3)).toBe(true);
  });

  it('respecte un seuil personnalisé', () => {
    expect(shouldQuarantine(2, 3)).toBe(false);
    expect(shouldQuarantine(3, 3)).toBe(true);
  });
});

// --- Fake Firestore minimal (compteur transactionnel) ------------------------
function makeFakeDeps(initialDoc) {
  const store = initialDoc
    ? { exists: true, data: { ...initialDoc } }
    : { exists: false, data: {} };
  const admin = {
    firestore: { FieldValue: { serverTimestamp: () => '<<ts>>' } },
  };
  const ref = {
    async get() {
      return { exists: store.exists, data: () => store.data };
    },
  };
  const db = {
    collection() {
      return { doc: () => ref };
    },
    async runTransaction(cb) {
      const tx = {
        async get() {
          return { exists: store.exists, data: () => store.data };
        },
        set(_ref, payload, opts) {
          if (opts && opts.merge) store.data = { ...store.data, ...payload };
          else store.data = payload;
          store.exists = true;
        },
      };
      return cb(tx);
    },
  };
  return { deps: { db, admin }, store };
}

describe('recordPoisonAttempt (compteur transactionnel)', () => {
  it('incrémente les tentatives, sans quarantaine sous le seuil', async () => {
    const { deps, store } = makeFakeDeps(null);
    const r1 = await recordPoisonAttempt(deps, 'msg1', new Error('boom'));
    expect(r1.attempts).toBe(1);
    expect(r1.quarantined).toBe(false);
    expect(store.data.last_error).toContain('boom');
  });

  it('met en quarantaine une fois le seuil atteint', async () => {
    const { deps } = makeFakeDeps({ attempts: MAX_ATTEMPTS - 1, quarantined: false });
    const r = await recordPoisonAttempt(deps, 'msg2', new Error('still failing'));
    expect(r.attempts).toBe(MAX_ATTEMPTS);
    expect(r.quarantined).toBe(true);
  });
});
