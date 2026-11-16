/**
 * Tests Vitest (env node) de l'activation Sentry (Sprint 57). Logique pure :
 * shouldEnableSentry. On ne teste pas l'envoi réel (effet de bord réseau).
 */

import { describe, it, expect } from 'vitest';
import { shouldEnableSentry } from './sentry.js';

describe('shouldEnableSentry', () => {
  it('actif si un SENTRY_DSN non vide est présent', () => {
    expect(shouldEnableSentry({ SENTRY_DSN: 'https://x@sentry.io/123' })).toBe(
      true,
    );
  });

  it('inactif si SENTRY_DSN absent ou vide', () => {
    expect(shouldEnableSentry({})).toBe(false);
    expect(shouldEnableSentry({ SENTRY_DSN: '' })).toBe(false);
    expect(shouldEnableSentry(null)).toBe(false);
  });
});
