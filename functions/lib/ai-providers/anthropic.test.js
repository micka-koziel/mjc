/**
 * Tests Vitest (env node) — adaptateur Anthropic : prompt caching (Sprint 68, M02-R4).
 */

import { describe, it, expect, afterEach } from 'vitest';
import { buildSystemField, cachingEnabled } from './anthropic.js';

const ORIGINAL = process.env.ANTHROPIC_PROMPT_CACHING;

afterEach(() => {
  if (ORIGINAL === undefined) delete process.env.ANTHROPIC_PROMPT_CACHING;
  else process.env.ANTHROPIC_PROMPT_CACHING = ORIGINAL;
});

describe('cachingEnabled', () => {
  it('est actif par défaut', () => {
    delete process.env.ANTHROPIC_PROMPT_CACHING;
    expect(cachingEnabled()).toBe(true);
  });

  it('se désactive avec le kill-switch', () => {
    process.env.ANTHROPIC_PROMPT_CACHING = 'false';
    expect(cachingEnabled()).toBe(false);
  });
});

describe('buildSystemField', () => {
  it('emballe le system en bloc cacheable quand le caching est actif', () => {
    delete process.env.ANTHROPIC_PROMPT_CACHING;
    const out = buildSystemField('Tu es un trieur.');
    expect(Array.isArray(out)).toBe(true);
    expect(out[0]).toMatchObject({
      type: 'text',
      text: 'Tu es un trieur.',
      cache_control: { type: 'ephemeral' },
    });
  });

  it('garde la chaîne brute quand le caching est coupé', () => {
    process.env.ANTHROPIC_PROMPT_CACHING = 'false';
    expect(buildSystemField('Tu es un trieur.')).toBe('Tu es un trieur.');
  });

  it('ne transforme pas un system vide', () => {
    delete process.env.ANTHROPIC_PROMPT_CACHING;
    expect(buildSystemField('')).toBe('');
    expect(buildSystemField(undefined)).toBe(undefined);
  });
});
