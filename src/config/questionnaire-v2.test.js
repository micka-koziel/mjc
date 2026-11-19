import { describe, it, expect } from 'vitest';
import fs from 'node:fs';
import { ALLOWED, validateAnswers } from './questionnaire-v2.mjs';

const read = (p) => JSON.parse(fs.readFileSync(p, 'utf8'));
const example = () => read('config/examples/client-fictif.atelier-ginkgo.json');

describe('questionnaire v2 : validation des réponses', () => {
  it('accepte la référence KHentik et l’exemple fictif', () => {
    expect(validateAnswers(read('config/khentik.reference.json')).errors).toEqual([]);
    expect(validateAnswers(example()).valid).toBe(true);
  });
  it('refuse un fichier du questionnaire v1 (obsolète)', () => {
    const v1 = example();
    delete v1.questionnaireVersion;
    const r = validateAnswers(v1);
    expect(r.valid).toBe(false);
    expect(r.errors[0]).toMatch(/version 2/);
  });
  it('les valeurs autorisées reprennent celles du questionnaire HTML', () => {
    const html = fs.readFileSync('questionnaire/questionnaire-v2.html', 'utf8');
    for (const [key, path] of [
      ['layout', 'appearance.layout'],
      ['messagePreview', 'appearance.messagePreview'],
      ['corners', 'appearance.corners'],
      ['formality', 'assistant.formality'],
      ['empathy', 'assistant.empathy'],
      ['signature', 'assistant.signature'],
    ]) {
      const block = html.slice(html.indexOf(`choice('${path}'`), html.indexOf(`choice('${path}'`) + 400);
      for (const v of Object.keys(ALLOWED[key])) expect(block).toContain(`['${v}'`);
    }
  });
  it('refuse une valeur hors liste, une couleur invalide et un secret', () => {
    const a = example();
    a.appearance.corners = 'arrondis';
    a.brand.extra.links = 'kraft';
    a.assistant.apiKey = 'x';
    const r = validateAnswers(a);
    expect(r.errors.some((e) => e.includes('appearance.corners'))).toBe(true);
    expect(r.errors.some((e) => e.includes('brand.extra.links'))).toBe(true);
    expect(r.errors.some((e) => e.includes('secret'))).toBe(true);
  });
  it('signale (sans bloquer) la case « couleurs KHentik » cochée', () => {
    const a = example();
    a.brand.colors.useKHentikDefaults = true;
    const r = validateAnswers(a);
    expect(r.valid).toBe(true);
    expect(r.warnings.join(' ')).toMatch(/jamais/);
  });
  it('refuse un document au format non accepté', () => {
    const a = example();
    a.documents = [{ name: 'x.exe', fileName: 'x.exe', mimeType: 'application/x-msdownload', dataUrl: 'data:application/x-msdownload;base64,AAAA' }];
    expect(validateAnswers(a).errors.join(' ')).toMatch(/non accepté/);
  });
});
