import { describe, it, expect } from 'vitest';
import fs from 'node:fs';
import { validateConfig, withDefaults, brandCssVariables, DEFAULT_CONFIG, readableOn } from './contract.mjs';

const read = (p) => JSON.parse(fs.readFileSync(p, 'utf8'));

describe('contrat de configuration', () => {
  it('la configuration de référence KHentik est valide', () => {
    expect(validateConfig(read('config/khentik.reference.json')).valid).toBe(true);
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
    const v = brandCssVariables(withDefaults({ brand: { colors: { useKHentikDefaults: false, primary: '#FFE600', accent: '#000000' } } }));
    expect(v['--q-primary']).toBe('#FFE600');
    expect(v['--q-primary-foreground']).toBe('#111827');
    expect(readableOn('#1E3A8A')).toBe('#FFFFFF');
  });
  it('fond et police des titres : facultatifs, valeurs neutres par défaut', () => {
    const v = brandCssVariables(withDefaults({}));
    expect(v['--q-bg-custom']).toBeUndefined();
    expect(v['--q-font-title']).toBe(v['--q-font']);
    const ancien = structuredClone(DEFAULT_CONFIG);
    delete ancien.brand.colors.background;
    delete ancien.appearance.titleFont;
    expect(validateConfig(ancien).valid).toBe(true);
  });
  it('applique un fond et une police des titres personnalisés', () => {
    const v = brandCssVariables(
      withDefaults({ brand: { colors: { background: '#F7F1EC' } }, appearance: { titleFont: 'serif' } })
    );
    expect(v['--q-bg-custom']).toBe('#F7F1EC');
    expect(v['--q-elevated-custom']).toMatch(/^#[0-9A-F]{6}$/);
    expect(v['--q-font-title']).toMatch(/Georgia/);
  });
  it('refuse un fond ou une police des titres invalides, alerte sur un fond trop foncé', () => {
    const cfg = structuredClone(DEFAULT_CONFIG);
    cfg.brand.colors.background = 'crème';
    cfg.appearance.titleFont = 'gothique';
    const r = validateConfig(cfg);
    expect(r.errors.some((e) => e.includes('brand.colors.background'))).toBe(true);
    expect(r.errors.some((e) => e.includes('appearance.titleFont'))).toBe(true);
    cfg.brand.colors.background = '#251815';
    cfg.appearance.titleFont = null;
    const r2 = validateConfig(cfg);
    expect(r2.valid).toBe(true);
    expect(r2.warnings.some((w) => w.includes('fond trop foncé'))).toBe(true);
  });
});
