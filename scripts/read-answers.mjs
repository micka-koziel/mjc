/**
 * Lecture d'un fichier de réponses au questionnaire v2.
 *
 * Formats acceptés :
 *  - .xlsx : export du questionnaire. Les réponses complètes (logos et
 *    documents compris) sont dans l'onglet « Donnees JSON », découpées en
 *    fragments (cellules B2, B3…) à recoller dans l'ordre ;
 *  - .json : même contenu, déjà recollé (fichiers de référence et tests).
 */
import fs from 'node:fs';
import path from 'node:path';
import ExcelJS from 'exceljs';

export const JSON_SHEET = 'Donnees JSON';

function cellText(value) {
  if (value === null || value === undefined) return '';
  if (typeof value === 'object' && Array.isArray(value.richText)) return value.richText.map((r) => r.text).join('');
  if (typeof value === 'object' && 'text' in value) return String(value.text);
  return String(value);
}

/** Réponses contenues dans un classeur Excel du questionnaire. */
export async function readAnswersFromXlsx(file) {
  const wb = new ExcelJS.Workbook();
  await wb.xlsx.readFile(file);
  const sheet = wb.getWorksheet(JSON_SHEET);
  if (!sheet) throw new Error(`Onglet « ${JSON_SHEET} » introuvable : ce n'est pas un export du questionnaire v2.`);
  const fragments = [];
  sheet.eachRow((row, n) => {
    if (n === 1) return; // en-têtes
    const order = cellText(row.getCell(1).value).trim();
    const text = cellText(row.getCell(2).value);
    if (text) fragments.push({ order: Number(order) || n, text });
  });
  if (!fragments.length) throw new Error(`Onglet « ${JSON_SHEET} » vide.`);
  fragments.sort((a, b) => a.order - b.order);
  try {
    return JSON.parse(fragments.map((f) => f.text).join(''));
  } catch (err) {
    throw new Error(`Réponses illisibles dans l'onglet « ${JSON_SHEET} » (${err.message}).`);
  }
}

/** Lit un fichier de réponses (.xlsx ou .json). */
export async function readAnswers(file) {
  if (!fs.existsSync(file)) throw new Error(`Fichier introuvable : ${file}`);
  const ext = path.extname(file).toLowerCase();
  if (ext === '.xlsx') return readAnswersFromXlsx(file);
  if (ext === '.json') {
    try {
      return JSON.parse(fs.readFileSync(file, 'utf8'));
    } catch (err) {
      throw new Error(`JSON illisible (${err.message}).`);
    }
  }
  throw new Error(`Format non pris en charge (${ext || 'sans extension'}) : .xlsx ou .json attendu.`);
}
