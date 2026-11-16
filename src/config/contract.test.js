import { describe, it, expect } from 'vitest';
import fs from 'node:fs';
import { validateConfig, withDefaults, brandCssVariables, DEFAULT_CONFIG, readableOn } from './contract.mjs';

const read = (p) => JSON.parse(fs.readFileSync(p, 'utf8'));

describe('contrat de configuration', () => {
  it('la configuration de référence Quantique est valide', () => {
    expect(validateConfig(read('config/quantique.reference.json')).valid).toBe(true);
  });
  it('l’exemple client fictif est valide et marqué comme fictif', () => {
    const ex = read('config/examples/client-fictif.atelier-ginkgo.json');
    expect(validateConfig(ex)).toMatchObject({ valid: true });
    expect(ex.client.isFictional).toBe(true);
  });
  it('la configuration active est valide', () => {
    expect(validateConfig(read('src/config/active.config.json')).valid).toBe(true);
  });
  it('refuse un logo donné par chemin local ou URL temporaire', () => {
    const cfg = structuredClone(DEFAULT_CONFIG);
    cfg.brand.logo.light = { dataUrl: 'blob:http://localhost/123', mimeType: 'image/png' };
    const r = validateConfig(cfg);
    expect(r.valid).toBe(false);
    expect(r.errors.join(' ')).toMatch(/survit pas/);
  });
  it('refuse les valeurs non supportées et les secrets', () => {
    const cfg = structuredClone(DEFAULT_CONFIG);
    cfg.appearance.theme = 'arc-en-ciel';
    cfg.assistant.apiKey = 'x';
    const r = validateConfig(cfg);
    expect(r.errors.some((e) => e.includes('appearance.theme'))).toBe(true);
    expect(r.errors.some((e) => e.includes('secret'))).toBe(true);
  });
  it('refuse un contexte marqué comme appliqué', () => {
    const cfg = structuredClone(DEFAULT_CONFIG);
    cfg.context.applied = true;
    expect(validateConfig(cfg).valid).toBe(false);
  });
  it('dérive des variables CSS lisibles', () => {
    const v = brandCssVariables(withDefaults({ brand: { colors: { useQuantiqueDefaults: false, primary: '#FFE600', accent: '#000000' } } }));
    expect(v['--q-primary']).toBe('#FFE600');
    expect(v['--q-primary-foreground']).toBe('#111827');
    expect(readableOn('#1E3A8A')).toBe('#FFFFFF');
  });
});
