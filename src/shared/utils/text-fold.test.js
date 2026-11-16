import { describe, it, expect } from 'vitest';
import { fold, indexOfWordStart, matchesQuery, normalizeSearch } from './text-fold';

describe('text-fold (Sprint 89)', () => {
  it('fold : accents et casse repliés, longueur préservée', () => {
    expect(fold('Rémi')).toBe('remi');
    expect(fold('Événement')).toBe('evenement');
    expect(fold('Ça brûle à Nîmes')).toBe('ca brule a nimes');
    expect(fold('Rémi').length).toBe('Rémi'.length);
  });

  it('fold : null/undefined/nombres', () => {
    expect(fold(null)).toBe('');
    expect(fold(undefined)).toBe('');
    expect(fold(42)).toBe('42');
  });

  it('normalizeSearch : replie + rogne', () => {
    expect(normalizeSearch('  Rémi  ')).toBe('remi');
    expect(normalizeSearch(null)).toBe('');
  });

  it('« Remi » trouve « Rémi » (la requête de Max)', () => {
    expect(fold('Rémi Polo AI 9/10').includes(normalizeSearch('Remi'))).toBe(true);
    expect(fold('remi').includes(normalizeSearch('Rémi'))).toBe(true);
  });
});

describe('Sprint 91 — recherche stricte (début de mot)', () => {
  it('« Rémi » ne remonte plus « premium » (cas Max du 02/09)', () => {
    expect(matchesQuery('Monsieur-premium@exemple.com', 'Rémi')).toBe(false);
    expect(matchesQuery('premium', 'remi')).toBe(false);
  });

  it('mais trouve toujours Rémi, accentué ou non', () => {
    expect(matchesQuery('Rémi Lechevalier', 'remi')).toBe(true);
    expect(matchesQuery('Rémi Lechevalier', 'Rémi')).toBe(true);
    expect(matchesQuery('Collab avec Rémi', 'remi')).toBe(true);
  });

  it('accepte un début de mot après une ponctuation ou une arobase', () => {
    expect(matchesQuery('contact@remi.fr', 'remi')).toBe(true);
    expect(matchesQuery('Lou-Anne', 'anne')).toBe(true);
    expect(matchesQuery('IFA (Berlin)', 'berlin')).toBe(true);
  });

  it('reste tolérant sur les débuts de mots partiels', () => {
    expect(matchesQuery('Rémi Lechevalier', 'lechev')).toBe(true);
  });

  it('exige que TOUS les termes soient présents', () => {
    expect(matchesQuery('Rémi Lechevalier', 'remi lechev')).toBe(true);
    expect(matchesQuery('Rémi Lechevalier', 'remi hugo')).toBe(false);
  });

  it('une requête vide ne filtre rien', () => {
    expect(matchesQuery('quoi que ce soit', '')).toBe(true);
    expect(matchesQuery('quoi que ce soit', '   ')).toBe(true);
  });

  it('indexOfWordStart renvoie une position alignée sur le texte d’origine', () => {
    // Le repliage préserve la longueur : l’index sert au surlignage.
    expect(indexOfWordStart(fold('Salon IFA Berlin'), 'ifa')).toBe(6);
    expect(indexOfWordStart(fold('premium'), 'remi')).toBe(-1);
  });
});
