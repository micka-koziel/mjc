/**
 * Tests Vitest (env node) du masquage PII des logs (Sprint 58, Action 5 d'Alex).
 * Fonctions pures : maskEmail, maskEmails, maskEmailList, maskName.
 */

import { describe, it, expect } from 'vitest';
import {
  maskEmail,
  maskEmails,
  maskEmailList,
  maskName,
} from './log-redact.js';

describe('maskEmail', () => {
  it('masque le local-part en gardant 1re lettre + domaine', () => {
    expect(maskEmail('mickael.koziel@gmail.com')).toBe('m***@gmail.com');
    expect(maskEmail('a@trendl.fr')).toBe('a***@trendl.fr');
  });

  it('préserve null/undefined (pour ne pas casser le log)', () => {
    expect(maskEmail(null)).toBe(null);
    expect(maskEmail(undefined)).toBe(undefined);
  });

  it('remplace les valeurs non-email par ***', () => {
    expect(maskEmail('pas-un-email')).toBe('***');
    expect(maskEmail(42)).toBe('***');
    expect(maskEmail({})).toBe('***');
  });
});

describe('maskEmails (texte libre)', () => {
  it('masque toutes les emails dans une phrase', () => {
    expect(
      maskEmails('contact jean@a.com ou marie@b.fr svp'),
    ).toBe('contact j***@a.com ou m***@b.fr svp');
  });

  it('laisse un texte sans email intact', () => {
    expect(maskEmails('aucun email ici')).toBe('aucun email ici');
  });

  it('renvoie les non-string tels quels', () => {
    expect(maskEmails(null)).toBe(null);
  });
});

describe('maskEmailList', () => {
  it('masque chaque email de la liste', () => {
    expect(maskEmailList(['jean@a.com', 'marie@b.fr'])).toEqual([
      'j***@a.com',
      'm***@b.fr',
    ]);
  });

  it('renvoie tel quel si ce n’est pas un tableau', () => {
    expect(maskEmailList('jean@a.com')).toBe('jean@a.com');
  });
});

describe('maskName', () => {
  it('réduit chaque mot à sa 1re lettre', () => {
    expect(maskName('Jean Dupont')).toBe('J*** D***');
    expect(maskName('Coca-Cola')).toBe('C***');
  });

  it('gère les espaces multiples et le trim', () => {
    expect(maskName('  Jean   Dupont  ')).toBe('J*** D***');
  });

  it('préserve null/undefined et masque le vide', () => {
    expect(maskName(null)).toBe(null);
    expect(maskName('   ')).toBe('***');
  });
});
