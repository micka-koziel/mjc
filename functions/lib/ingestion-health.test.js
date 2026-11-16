/**
 * Tests Vitest (env node) de la décision d'alerte du healthcheck d'ingestion
 * (Sprint 57, Action 1 d'Alex). Logique pure : shouldAlertRecovery.
 */

import { describe, it, expect } from 'vitest';
import {
  shouldAlertRecovery,
  RECOVERY_ALERT_THRESHOLD,
} from './ingestion-health.js';

describe('shouldAlertRecovery', () => {
  it('n’alerte pas en-dessous du seuil (échec ponctuel)', () => {
    expect(shouldAlertRecovery(0)).toBe(false);
    expect(shouldAlertRecovery(1)).toBe(false);
    expect(shouldAlertRecovery(RECOVERY_ALERT_THRESHOLD - 1)).toBe(false);
  });

  it('alerte au seuil et au-delà (panne durable)', () => {
    expect(shouldAlertRecovery(RECOVERY_ALERT_THRESHOLD)).toBe(true);
    expect(shouldAlertRecovery(RECOVERY_ALERT_THRESHOLD + 5)).toBe(true);
  });

  it('traite une entrée absente comme 0 (pas d’alerte)', () => {
    expect(shouldAlertRecovery(undefined)).toBe(false);
    expect(shouldAlertRecovery(null)).toBe(false);
  });

  it('respecte un seuil personnalisé', () => {
    expect(shouldAlertRecovery(2, 5)).toBe(false);
    expect(shouldAlertRecovery(5, 5)).toBe(true);
  });
});
