/**
 * Tests Vitest (env node) du calcul de coût IA (Sprint 57, Action 1 d'Alex).
 * On teste la logique PURE : resolvePricing + computeUsageCost.
 */

import { describe, it, expect } from 'vitest';
import {
  resolvePricing,
  computeUsageCost,
  estimateTavilyCredits,
} from './observability.js';

describe('resolvePricing', () => {
  it('résout une famille par correspondance exacte', () => {
    expect(resolvePricing('claude-sonnet-4-6')).toMatchObject({
      input: 3,
      output: 15,
    });
  });

  it('résout un id versionné par préfixe de famille', () => {
    // L'id réel utilisé dans le code porte un suffixe de date.
    expect(resolvePricing('claude-haiku-4-5-20251001')).toMatchObject({
      input: 1,
      output: 5,
    });
  });

  it('renvoie null sur modèle inconnu ou entrée invalide', () => {
    expect(resolvePricing('claude-zzz-9')).toBeNull();
    expect(resolvePricing(null)).toBeNull();
    expect(resolvePricing(undefined)).toBeNull();
    expect(resolvePricing(42)).toBeNull();
  });
});

describe('computeUsageCost', () => {
  it('coste un appel Haiku entrée/sortie', () => {
    const res = computeUsageCost('claude-haiku-4-5-20251001', {
      input_tokens: 1000,
      output_tokens: 500,
    });
    // 1000/1e6*1 + 500/1e6*5 = 0.001 + 0.0025
    expect(res.priced).toBe(true);
    expect(res.inputTokens).toBe(1000);
    expect(res.outputTokens).toBe(500);
    expect(res.costUsd).toBeCloseTo(0.0035, 6);
  });

  it('coste un appel Sonnet entrée/sortie', () => {
    const res = computeUsageCost('claude-sonnet-4-6', {
      input_tokens: 10000,
      output_tokens: 2000,
    });
    // 10000/1e6*3 + 2000/1e6*15 = 0.03 + 0.03
    expect(res.costUsd).toBeCloseTo(0.06, 6);
  });

  it('intègre les tokens de cache (lecture remisée + écriture majorée)', () => {
    const res = computeUsageCost('claude-sonnet-4-6', {
      input_tokens: 1000,
      output_tokens: 1000,
      cache_read_input_tokens: 5000,
      cache_creation_input_tokens: 2000,
    });
    // 0.003 + 0.015 + 5000/1e6*0.3 + 2000/1e6*3.75 = 0.003+0.015+0.0015+0.0075
    expect(res.cacheReadTokens).toBe(5000);
    expect(res.cacheCreationTokens).toBe(2000);
    expect(res.costUsd).toBeCloseTo(0.027, 6);
  });

  it('traite un usage absent comme 0 token sans planter', () => {
    const res = computeUsageCost('claude-sonnet-4-6', undefined);
    expect(res.priced).toBe(true);
    expect(res.inputTokens).toBe(0);
    expect(res.outputTokens).toBe(0);
    expect(res.costUsd).toBe(0);
  });

  it('renvoie priced:false sur modèle non tarifé (sans inventer de coût)', () => {
    const res = computeUsageCost('claude-zzz-9', {
      input_tokens: 1000,
      output_tokens: 1000,
    });
    expect(res.priced).toBe(false);
    expect(res.costUsd).toBe(0);
    // On conserve quand même le comptage des tokens pour diagnostic.
    expect(res.inputTokens).toBe(1000);
  });
});

describe('estimateTavilyCredits', () => {
  it('compte 1 crédit pour une recherche basic, 2 pour advanced', () => {
    expect(estimateTavilyCredits({ endpoint: 'search', depth: 'basic' })).toBe(1);
    expect(
      estimateTavilyCredits({ endpoint: 'search', depth: 'advanced' }),
    ).toBe(2);
  });

  it('facture l’extraction par tranche de 5 URLs', () => {
    // 1 à 5 URLs = 1 tranche
    expect(
      estimateTavilyCredits({ endpoint: 'extract', depth: 'basic', urlCount: 5 }),
    ).toBe(1);
    // 6 URLs = 2 tranches
    expect(
      estimateTavilyCredits({ endpoint: 'extract', depth: 'basic', urlCount: 6 }),
    ).toBe(2);
    // 6 URLs en advanced = 2 tranches × 2 crédits
    expect(
      estimateTavilyCredits({
        endpoint: 'extract',
        depth: 'advanced',
        urlCount: 6,
      }),
    ).toBe(4);
  });

  it('renvoie 0 crédit pour une extraction sans URL', () => {
    expect(
      estimateTavilyCredits({ endpoint: 'extract', urlCount: 0 }),
    ).toBe(0);
  });
});
