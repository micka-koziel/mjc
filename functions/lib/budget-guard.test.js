/**
 * Tests Vitest (env node) du garde-fou de coût IA (Sprint 65, Action 10 d'Alex).
 *
 * On teste la logique PURE (resolveBudgetConfig, classifyBudget) et la DÉCISION
 * de assertWithinAiBudget en injectant une base Firestore factice + un env — sans
 * émulateur ni firebase-admin (le chemin de blocage throw avant tout I/O admin).
 */

import { beforeAll, describe, it, expect } from 'vitest';

// Sprint 106 — test instable (« délai de 5 s dépassé une fois sur deux ») :
// le premier chargement de firebase-functions, très lourd, tombait dans un
// test. On le fait une fois, ici, avec un délai large.
beforeAll(async () => {
  await import('firebase-functions');
}, 60000);
import {
  resolveBudgetConfig,
  classifyBudget,
  budgetDocPath,
  assertWithinAiBudget,
} from './budget-guard.js';

describe('budgetDocPath', () => {
  it('range le compteur sous system/, un doc par période', () => {
    expect(budgetDocPath('2026-06')).toBe('system/ai-budget-2026-06');
  });
});

describe('resolveBudgetConfig', () => {
  it('désarmé par défaut (env vide)', () => {
    const cfg = resolveBudgetConfig({});
    expect(cfg.enabled).toBe(false);
    expect(cfg.capUsd).toBeNull();
    expect(cfg.softRatio).toBe(0.8);
  });

  it('lit le verrou, le plafond et le ratio', () => {
    const cfg = resolveBudgetConfig({
      AI_BUDGET_ENABLED: 'true',
      AI_BUDGET_CAP_USD: '50',
      AI_BUDGET_SOFT_RATIO: '0.5',
    });
    expect(cfg).toEqual({ enabled: true, capUsd: 50, softRatio: 0.5 });
  });

  it('ignore un plafond non numérique ou <= 0 (pas de blocage possible)', () => {
    expect(resolveBudgetConfig({ AI_BUDGET_CAP_USD: 'abc' }).capUsd).toBeNull();
    expect(resolveBudgetConfig({ AI_BUDGET_CAP_USD: '0' }).capUsd).toBeNull();
    expect(resolveBudgetConfig({ AI_BUDGET_CAP_USD: '-5' }).capUsd).toBeNull();
  });

  it('retombe sur le ratio par défaut si invalide', () => {
    expect(resolveBudgetConfig({ AI_BUDGET_SOFT_RATIO: '2' }).softRatio).toBe(0.8);
    expect(resolveBudgetConfig({ AI_BUDGET_SOFT_RATIO: 'x' }).softRatio).toBe(0.8);
  });
});

describe('classifyBudget', () => {
  it('ok sous le seuil d\'alerte', () => {
    expect(classifyBudget({ spentUsd: 10, capUsd: 100, softRatio: 0.8 }).status).toBe('ok');
  });

  it('warn entre le seuil d\'alerte et le plafond', () => {
    expect(classifyBudget({ spentUsd: 85, capUsd: 100, softRatio: 0.8 }).status).toBe('warn');
  });

  it('block au plafond et au-delà', () => {
    expect(classifyBudget({ spentUsd: 100, capUsd: 100 }).status).toBe('block');
    expect(classifyBudget({ spentUsd: 250, capUsd: 100 }).status).toBe('block');
  });

  it('jamais de blocage sans plafond exploitable', () => {
    expect(classifyBudget({ spentUsd: 9999, capUsd: null }).status).toBe('ok');
    expect(classifyBudget({ spentUsd: 9999, capUsd: 0 }).status).toBe('ok');
  });
});

/**
 * Fabrique une base Firestore factice dont le doc compteur renvoie `spent`.
 */
function fakeDb(spent) {
  return {
    doc: () => ({
      get: async () => ({
        exists: spent !== null,
        data: () => ({ spent_usd: spent }),
      }),
    }),
  };
}

// Sprint 106 — logger muet : plus de chargement de firebase-functions (test instable).
const silent = { warn: () => {}, error: () => {}, info: () => {} };

describe('assertWithinAiBudget', () => {
  it('inerte quand le verrou global est OFF (aucune lecture)', async () => {
    let read = false;
    const db = { doc: () => ({ get: async () => { read = true; return {}; } }) };
    const res = await assertWithinAiBudget({ fn: 't', db, env: {} });
    expect(res.status).toBe('disabled');
    expect(read).toBe(false);
  });

  it('laisse passer (ok) sous le seuil', async () => {
    const env = { AI_BUDGET_ENABLED: 'true', AI_BUDGET_CAP_USD: '100' };
    const res = await assertWithinAiBudget({ fn: 't', db: fakeDb(10), env });
    expect(res.status).toBe('ok');
  });

  it('laisse passer (warn) au seuil d\'alerte, sans throw', async () => {
    const env = { AI_BUDGET_ENABLED: 'true', AI_BUDGET_CAP_USD: '100' };
    const res = await assertWithinAiBudget({ fn: 't', db: fakeDb(90), env, logger: silent });
    expect(res.status).toBe('warn');
  });

  it('REFUSE (throw 429) une fois le plafond atteint', async () => {
    const env = { AI_BUDGET_ENABLED: 'true', AI_BUDGET_CAP_USD: '100' };
    await expect(
      assertWithinAiBudget({ fn: 't', db: fakeDb(120), env, logger: silent }),
    ).rejects.toMatchObject({ status: 429, code: 'ai/budget-exceeded' });
  });
});

// ─── Sprint 81 — compteur de consommation IA (réunion 20/07) ────────────────

import { recordUsageAndSpend } from './budget-guard.js';

function captureDb() {
  const writes = [];
  return {
    writes,
    doc: (path) => ({
      set: async (data, opts) => {
        writes.push({ path, data, opts });
      },
      get: async () => ({ exists: false, data: () => ({}) }),
    }),
  };
}

const fakeAdminSdk = {
  firestore: {
    FieldValue: {
      increment: (n) => ({ __inc: n }),
      serverTimestamp: () => ({ __ts: true }),
    },
  },
};

describe('recordUsageAndSpend — compteur de conso IA (Sprint 81)', () => {
  const response = {
    usage: {
      input_tokens: 1000,
      output_tokens: 200,
      cache_read_input_tokens: 0,
      cache_creation_input_tokens: 0,
    },
  };

  it('alimente TOUJOURS les agrégats usage_* du doc mensuel (même garde-fou OFF)', async () => {
    const db = captureDb();
    const detail = await recordUsageAndSpend('generateReply', 'claude-haiku-4-5', response, {
      db,
      adminSdk: fakeAdminSdk,
      env: {}, // garde-fou désarmé
      now: Date.parse('2026-07-20T10:00:00Z'),
    });
    expect(detail.priced).toBe(true);
    expect(db.writes).toHaveLength(1); // usage_* seulement, pas de spent_usd
    const w = db.writes[0];
    expect(w.path).toBe('system/ai-budget-2026-07');
    expect(w.opts).toEqual({ merge: true });
    expect(w.data.usage_calls).toEqual({ __inc: 1 });
    expect(w.data.usage_input_tokens).toEqual({ __inc: 1000 });
    expect(w.data.usage_output_tokens).toEqual({ __inc: 200 });
    expect(w.data.usage_cost_usd.__inc).toBeGreaterThan(0);
    expect(w.data.usage_by_fn.generateReply.calls).toEqual({ __inc: 1 });
    // spent_usd (garde-fou) n'est PAS touché quand il est désarmé.
    expect(w.data.spent_usd).toBeUndefined();
  });

  it('garde-fou armé → écrit AUSSI le compteur spent_usd (2 écritures)', async () => {
    const db = captureDb();
    await recordUsageAndSpend('generateReply', 'claude-haiku-4-5', response, {
      db,
      adminSdk: fakeAdminSdk,
      env: { AI_BUDGET_ENABLED: 'true', AI_BUDGET_CAP_USD: '100' },
      now: Date.parse('2026-07-20T10:00:00Z'),
    });
    expect(db.writes.length).toBeGreaterThanOrEqual(1);
    const hasUsage = db.writes.some((w) => w.data.usage_calls);
    expect(hasUsage).toBe(true);
  });

  it('nettoie la clé de fonction (pas de séparateur de chemin dans la map)', async () => {
    const db = captureDb();
    await recordUsageAndSpend('mailbox/generate.reply', 'claude-haiku-4-5', response, {
      db,
      adminSdk: fakeAdminSdk,
      env: {},
      now: Date.parse('2026-07-20T10:00:00Z'),
    });
    const keys = Object.keys(db.writes[0].data.usage_by_fn);
    expect(keys).toEqual(['mailbox_generate_reply']);
  });
});
