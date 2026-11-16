/**
 * Tests unitaires — functions/lib/email-validate.js (Sprint 29).
 */
import { describe, it, expect } from 'vitest';
import {
  extractAddress,
  isValidEmail,
  validateRecipients,
} from './email-validate.js';

describe('email-validate — extractAddress', () => {
  it('extrait l’adresse d’un format « Nom <adresse> »', () => {
    expect(extractAddress('Jean <jean@example.com>')).toBe('jean@example.com');
  });
  it('retourne l’adresse brute si pas de chevrons', () => {
    expect(extractAddress(' jean@example.com ')).toBe('jean@example.com');
  });
});

describe('email-validate — isValidEmail', () => {
  it('accepte une adresse standard', () => {
    expect(isValidEmail('mickael.koziel@saint-gobain.com')).toBe(true);
  });
  it('rejette une adresse sans TLD (bug du sprint)', () => {
    expect(isValidEmail('mickael.koziel@saint-gobain')).toBe(false);
  });
  it('rejette une entrée vide', () => {
    expect(isValidEmail('')).toBe(false);
  });
});

describe('email-validate — validateRecipients', () => {
  it('sépare valides et invalides', () => {
    const { valid, invalid } = validateRecipients(
      'ok@x.com; cassé@saint-gobain, autre@y.com',
    );
    expect(valid).toEqual(['ok@x.com', 'autre@y.com']);
    expect(invalid).toEqual(['cassé@saint-gobain']);
  });
  it('retourne deux listes vides pour entrée vide', () => {
    expect(validateRecipients('')).toEqual({ valid: [], invalid: [] });
  });
});
