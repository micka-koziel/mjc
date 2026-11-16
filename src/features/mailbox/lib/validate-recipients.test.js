import { describe, it, expect } from 'vitest';
import {
  extractAddress,
  isValidEmail,
  splitRecipients,
  validateRecipients,
} from './validate-recipients';

describe('validate-recipients (Sprint 29)', () => {
  describe('extractAddress', () => {
    it('extrait l’adresse d’un format « Nom <adresse> »', () => {
      expect(extractAddress('Jean Dupont <jean@example.com>')).toBe(
        'jean@example.com',
      );
    });
    it('retourne l’adresse brute si pas de chevrons', () => {
      expect(extractAddress('  jean@example.com ')).toBe('jean@example.com');
    });
  });

  describe('isValidEmail', () => {
    it('accepte une adresse standard', () => {
      expect(isValidEmail('mickael.koziel@saint-gobain.com')).toBe(true);
    });
    it('accepte le format « Nom <adresse> »', () => {
      expect(isValidEmail('Trendl <contact@trendl.agency>')).toBe(true);
    });
    it('rejette une adresse sans TLD (le bug du sprint)', () => {
      expect(isValidEmail('mickael.koziel@saint-gobain')).toBe(false);
    });
    it('rejette une adresse sans @', () => {
      expect(isValidEmail('pas-une-adresse')).toBe(false);
    });
  });

  describe('splitRecipients', () => {
    it('découpe sur virgule et point-virgule', () => {
      expect(splitRecipients('a@x.com, b@y.com; c@z.com')).toEqual([
        'a@x.com',
        'b@y.com',
        'c@z.com',
      ]);
    });
    it('retourne [] pour une entrée vide', () => {
      expect(splitRecipients('')).toEqual([]);
    });
  });

  describe('validateRecipients', () => {
    it('sépare valides et invalides', () => {
      const { valid, invalid } = validateRecipients(
        'ok@x.com, cassé@saint-gobain, autre@y.com',
      );
      expect(valid).toEqual(['ok@x.com', 'autre@y.com']);
      expect(invalid).toEqual(['cassé@saint-gobain']);
    });
  });
});
