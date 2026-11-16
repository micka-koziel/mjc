import { describe, it, expect } from 'vitest';
import fs from 'node:fs';
import crypto from 'node:crypto';

// Garantit que le questionnaire livré embarque EXACTEMENT le contrat courant.
describe('questionnaire ↔ contrat', () => {
  it('questionnaire.html contient la version actuelle de contract.mjs', () => {
    const src = fs.readFileSync('src/config/contract.mjs', 'utf8');
    const hash = crypto.createHash('sha256').update(src).digest('hex').slice(0, 12);
    const html = fs.readFileSync('questionnaire/questionnaire.html', 'utf8');
    expect(html).toContain(`contract.mjs sha256:${hash}`);
    expect(html).toContain(src.replace(/^export\s+/gm, ''));
  });
});
