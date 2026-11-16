/**
 * Tests Vitest (env node) — Sprint 82.1 (hotfix bascule de boîte).
 *
 * Contexte (session Alex+Max 21/07) : les historyId Gmail sont propres à
 * CHAQUE boîte. Après la bascule vers la boîte de Max, le marque-page de
 * l'ancienne boîte bloquait la lecture (listHistory 404 en boucle) et les
 * notifications de l'ancienne boîte re-polluaient le curseur. On teste ici
 * la décision PURE de remise à zéro du marque-page.
 */

import {describe, it, expect} from 'vitest';
import {shouldResetCursor} from './watch-helpers.js';

describe('shouldResetCursor — Sprint 82.1', () => {
  it('relance manuelle (started) → toujours reset, même boîte inchangée', () => {
    expect(shouldResetCursor('started', 'max@trendl.agency', 'max@trendl.agency')).toBe(true);
    expect(shouldResetCursor('started', null, 'max@trendl.agency')).toBe(true);
  });

  it('renouvellement/recovery sur la MÊME boîte → on garde le curseur', () => {
    expect(shouldResetCursor('renewed', 'max@trendl.agency', 'max@trendl.agency')).toBe(false);
    expect(shouldResetCursor('recovery', 'max@trendl.agency', 'max@trendl.agency')).toBe(false);
  });

  it('recovery après CHANGEMENT de boîte (exploitant) → reset', () => {
    expect(shouldResetCursor('recovery', 'mickael@gmail.com', 'max@trendl.agency')).toBe(true);
    expect(shouldResetCursor('renewed', 'mickael@gmail.com', 'max@trendl.agency')).toBe(true);
  });

  it('boîte précédente inconnue (docs historiques sans watch_email) → prudence, pas de reset hors started', () => {
    expect(shouldResetCursor('renewed', null, 'max@trendl.agency')).toBe(false);
    expect(shouldResetCursor('recovery', null, 'max@trendl.agency')).toBe(false);
  });
});
