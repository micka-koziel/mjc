/**
 * Tests unitaires — src/shared/utils/cn.js
 *
 * cn() est l'utility de fusion de classes CSS utilisée partout dans l'UI.
 * Doit être 100% robuste car appelée à chaque render.
 *
 * Sprint 14, PR 3.
 */
import { describe, it, expect } from 'vitest';
import { cn } from './cn.js';

describe('cn — fusion de classes CSS conditionnelles', () => {
  it('concatène plusieurs strings avec un espace', () => {
    expect(cn('btn', 'btn-lg', 'btn-primary')).toBe('btn btn-lg btn-primary');
  });

  it('garde uniquement les valeurs truthy', () => {
    expect(cn('btn', false, 'btn-active', null, undefined, '')).toBe('btn btn-active');
  });

  it('renvoie une string vide quand tout est falsy', () => {
    expect(cn(false, null, undefined, '')).toBe('');
  });

  it('renvoie une string vide quand aucun argument', () => {
    expect(cn()).toBe('');
  });

  it('gère le pattern conditionnel typique (cond && classe)', () => {
    const isActive = true;
    const isDisabled = false;
    expect(cn('btn', isActive && 'active', isDisabled && 'disabled')).toBe('btn active');
  });
});
