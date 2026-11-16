/**
 * Tests Vitest (env node) — history-cursor.js (Sprint 68, M04-R5).
 */

import { describe, it, expect } from 'vitest';
import { isNewerHistoryId, advanceHistoryCursor } from './history-cursor.js';

describe('isNewerHistoryId (garde monotone, pure)', () => {
  it('avance si la nouvelle valeur est strictement plus grande', () => {
    expect(isNewerHistoryId('1002', '1001')).toBe(true);
    expect(isNewerHistoryId('1001', '1002')).toBe(false);
    expect(isNewerHistoryId('1001', '1001')).toBe(false);
  });

  it('compare en BigInt (très grands historyId)', () => {
    expect(isNewerHistoryId('99999999999999999999', '99999999999999999998')).toBe(true);
    expect(isNewerHistoryId('99999999999999999998', '99999999999999999999')).toBe(false);
  });

  it('accepte tout quand il n’y a pas encore de curseur', () => {
    expect(isNewerHistoryId('5', null)).toBe(true);
    expect(isNewerHistoryId('5', '')).toBe(true);
  });

  it('refuse une valeur vide/absente', () => {
    expect(isNewerHistoryId(null, '5')).toBe(false);
    expect(isNewerHistoryId('', '5')).toBe(false);
  });
});

// --- Fake Firestore minimal pour la partie transactionnelle ------------------
function makeFakeDeps(initialData) {
  const store = { ...initialData };
  const admin = {
    firestore: {
      FieldValue: { serverTimestamp: () => '<<ts>>' },
    },
  };
  const db = {
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

describe('advanceHistoryCursor (transaction monotone)', () => {
  it('avance le curseur quand la valeur est plus récente', async () => {
    const { deps, store } = makeFakeDeps({ exists: true, data: { lastHistoryId: '1000' } });
    const res = await advanceHistoryCursor(deps, {}, '1005', { lastIngestedCount: 2 });
    expect(res.advanced).toBe(true);
    expect(store.data.lastHistoryId).toBe('1005');
    expect(store.data.lastIngestedCount).toBe(2);
  });

  it('NE recule PAS le curseur sur une valeur plus ancienne (mais écrit les métadonnées)', async () => {
    const { deps, store } = makeFakeDeps({ exists: true, data: { lastHistoryId: '2000' } });
    const res = await advanceHistoryCursor(deps, {}, '1500', { lastIngestedCount: 0 });
    expect(res.advanced).toBe(false);
    expect(store.data.lastHistoryId).toBe('2000'); // inchangé
    expect(store.data.lastIngestedCount).toBe(0); // méta écrite quand même
  });
});
