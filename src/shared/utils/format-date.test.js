// @vitest-environment node
import { describe, it, expect } from 'vitest';
import {
  toMs,
  formatDateShort,
  formatDateLong,
  formatDateTime,
  formatDateRelative,
} from './format-date';

describe('toMs', () => {
  it('retourne null pour des valeurs absentes', () => {
    expect(toMs(null)).toBe(null);
    expect(toMs(undefined)).toBe(null);
    expect(toMs('')).toBe(null);
  });

  it('passe un number ms tel quel', () => {
    expect(toMs(1700000000000)).toBe(1700000000000);
  });

  it('convertit un Date', () => {
    const d = new Date('2026-01-15T00:00:00Z');
    expect(toMs(d)).toBe(d.getTime());
  });

  it('convertit un Firestore Timestamp (méthode toMillis)', () => {
    const fakeTs = {
      seconds: 1700000000,
      nanoseconds: 0,
      toMillis() {
        return this.seconds * 1000 + Math.floor(this.nanoseconds / 1e6);
      },
    };
    expect(toMs(fakeTs)).toBe(1700000000000);
  });

  it('convertit un Firestore Timestamp brut sérialisé ({seconds, nanoseconds})', () => {
    // C'est le cas QUI A CASSÉ /admin/opportunities en Sprint 18 :
    // Firestore renvoie cet objet, on tentait de le rendre en brut.
    const rawTs = { seconds: 1700000000, nanoseconds: 500000000 };
    expect(toMs(rawTs)).toBe(1700000000500);
  });

  it('convertit un Timestamp Admin SDK sérialisé res.json ({_seconds, _nanoseconds}) — S81', () => {
    // Cas creatorPortalData : serverTimestamp() → res.json() → {_seconds,…}.
    const adminTs = { _seconds: 1700000000, _nanoseconds: 500000000 };
    expect(toMs(adminTs)).toBe(1700000000500);
  });

  it('convertit une string ISO', () => {
    expect(toMs('2026-01-15')).toBe(new Date('2026-01-15').getTime());
  });

  it('retourne null pour une string invalide', () => {
    expect(toMs('pas une date')).toBe(null);
  });
});

describe('formatDateShort', () => {
  it('retourne null si invalide', () => {
    expect(formatDateShort(null)).toBe(null);
    expect(formatDateShort('foo')).toBe(null);
  });

  it('formate au format DD/MM/YYYY (fr-FR)', () => {
    const d = new Date(2026, 0, 15); // 15 janvier 2026 local
    expect(formatDateShort(d)).toBe('15/01/2026');
  });

  it('formate un Firestore Timestamp brut', () => {
    // 15 janvier 2026 00:00:00 UTC
    const ts = { seconds: Math.floor(Date.UTC(2026, 0, 15) / 1000), nanoseconds: 0 };
    const out = formatDateShort(ts);
    // Selon TZ système, ça peut être le 14 ou le 15 — on vérifie juste le format
    expect(out).toMatch(/^\d{2}\/\d{2}\/\d{4}$/);
  });
});

describe('formatDateLong', () => {
  it('formate en long fr-FR', () => {
    const d = new Date(2026, 0, 15);
    expect(formatDateLong(d)).toBe('15 janvier 2026');
  });
});

describe('formatDateTime', () => {
  it('formate "DD/MM/YYYY à HH:MM"', () => {
    const d = new Date(2026, 0, 15, 14, 30);
    expect(formatDateTime(d)).toBe('15/01/2026 à 14:30');
  });
});

describe('formatDateRelative', () => {
  it("renvoie 'aujourd'hui' pour now", () => {
    expect(formatDateRelative(new Date())).toBe("aujourd'hui");
  });

  it("renvoie 'demain' pour now + 1j", () => {
    const d = new Date(Date.now() + 24 * 60 * 60 * 1000);
    expect(formatDateRelative(d)).toBe('demain');
  });

  it("renvoie 'hier' pour now - 1j", () => {
    const d = new Date(Date.now() - 24 * 60 * 60 * 1000);
    expect(formatDateRelative(d)).toBe('hier');
  });
});
