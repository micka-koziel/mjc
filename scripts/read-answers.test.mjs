// @vitest-environment node
import { describe, it, expect } from 'vitest';
import { readAnswers } from './read-answers.mjs';
import { buildInstance } from '../src/config/instance.mjs';

describe('lecture du fichier Excel du questionnaire v2', () => {
  it('recolle l’onglet « Donnees JSON » du fichier de Mon jardin chocolaté', async () => {
    const answers = await readAnswers('config/clients/mjc/questionnaire.xlsx');
    expect(answers.questionnaireVersion).toBe('2.0');
    expect(answers.client.companyName).toBe('Mon jardin chocolaté');
    expect(answers.documents).toHaveLength(2);
    expect(buildInstance(answers).valid).toBe(true);
  });
  it('refuse un format inconnu', async () => {
    await expect(readAnswers('package.json.txt')).rejects.toThrow(/introuvable/);
    await expect(readAnswers('README.md')).rejects.toThrow(/Format non pris en charge/);
  });
});
