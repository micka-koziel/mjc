import { describe, it, expect } from 'vitest';
import fs from 'node:fs';
import { buildInstance, splitList, withInstanceDefaults } from './instance.mjs';

const read = (p) => JSON.parse(fs.readFileSync(p, 'utf8'));
const example = () => read('config/examples/client-fictif.atelier-ginkgo.json');
const textDoc = (name, text) => ({
  name,
  fileName: name,
  size: text.length,
  mimeType: 'text/plain',
  dataUrl: `data:text/plain;base64,${Buffer.from(text, 'utf8').toString('base64')}`,
});

describe('configuration d’instance', () => {
  it('sépare interface (navigateur) et profil IA (serveur)', () => {
    const a = example();
    a.assistant.instructions = 'Paragraphes courts.';
    a.context.importantSenders = 'Annie Do, Bastien Frappart';
    const r = buildInstance(a);
    expect(r.valid).toBe(true);
    expect(JSON.stringify(r.ui)).not.toContain('Paragraphes courts');
    expect(r.ai.assistant.instructions).toBe('Paragraphes courts.');
    expect(r.ui.priorities.importantSenders).toEqual(['annie do', 'bastien frappart']);
    expect(r.ui.brand.logo.light).toBe('/brand/logo-light.svg');
    expect(r.logos.map((l) => l.fileName)).toEqual(['logo-light.svg', 'logo-dark.svg']);
  });
  it('n’applique jamais les couleurs KHentik à un client', () => {
    const a = example();
    a.brand.colors.useKHentikDefaults = true;
    expect(buildInstance(a).ui.brand.colors.primary).toBe('#7A3E1D');
  });
  it('applique les arbitrages (charte, police de charte) et les signale', () => {
    const r = buildInstance(example(), {
      note: 'charte officielle',
      brand: { colors: { primary: '#4F2C1D', text: '#4F2C1D' }, extra: { surface: '#FFFFFF' } },
      appearance: { font: 'worksans', titleFont: 'worksans' },
    });
    expect(r.valid).toBe(true);
    expect(r.ui.brand.colors).toMatchObject({ primary: '#4F2C1D', text: '#4F2C1D', background: '#FFFFFF' });
    expect(r.ui.appearance.font).toBe('worksans');
    expect(r.warnings.join(' ')).toMatch(/charte officielle/);
  });
  it('refuse un arbitrage invalide', () => {
    const r = buildInstance(example(), { brand: { colors: { text: 'marron' } }, appearance: { titleFont: 'comic' } });
    expect(r.valid).toBe(false);
    expect(r.errors.length).toBe(2);
  });
  it('ne transmet à l’IA que les documents texte explicitement désignés', () => {
    const a = example();
    a.documents = [textDoc('style.txt', 'Écrire court. Jamais de tiret cadratin.'), textDoc('autre.txt', 'secret commercial')];
    expect(buildInstance(a).ai.referenceTexts).toEqual([]);
    const r = buildInstance(a, { ai: { referenceDocuments: ['style.txt'] } });
    expect(r.ai.referenceTexts).toEqual([{ fileName: 'style.txt', text: 'Écrire court. Jamais de tiret cadratin.' }]);
    expect(buildInstance(a, { ai: { referenceDocuments: ['absent.txt'] } }).valid).toBe(false);
  });
  it('n’envoie la signature personnalisée que si l’option « personnalisée » est choisie', () => {
    const a = example();
    a.assistant.signatureText = 'Carine';
    a.assistant.signature = 'none';
    expect(buildInstance(a).ai.assistant.signatureText).toBe('');
    a.assistant.signature = 'custom';
    expect(buildInstance(a).ai.assistant.signatureText).toBe('Carine');
  });
  it('arbitrage : nom, phrase d’accroche et avatar de l’assistant', () => {
    const r = buildInstance(example(), { assistant: { name: 'Alice', tagline: 'Votre assistante', avatarFile: 'alice.svg' } });
    expect(r.ui.assistant).toMatchObject({ name: 'Alice', tagline: 'Votre assistante', avatar: '/brand/assistant-avatar.svg' });
    expect(r.ai.assistant.name).toBe('Alice');
    expect(r.assistantAvatar).toEqual({ source: 'alice.svg', fileName: 'assistant-avatar.svg' });
    expect(buildInstance(example()).ui.assistant.avatar).toBeNull();
    expect(buildInstance(example(), { assistant: { avatarFile: '../secret.txt' } }).valid).toBe(false);
  });
  it('outils', () => {
    expect(splitList('a; B\n c,,')).toEqual(['a', 'b', 'c']);
    expect(withInstanceDefaults({ appearance: { corners: 'square' } }).appearance).toMatchObject({ corners: 'square', theme: 'light' });
  });
  it('la configuration active installée est cohérente', () => {
    const ui = read('src/config/active.config.json');
    expect(ui.instanceVersion).toBe(1);
    for (const which of ['light', 'dark']) {
      if (ui.brand.logo[which]) expect(fs.existsSync(`public${ui.brand.logo[which]}`)).toBe(true);
    }
  });
});
