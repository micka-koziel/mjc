#!/usr/bin/env node
/**
 * Configuration d'une instance client à partir du questionnaire v2.
 *
 *   npm run config:validate -- config/clients/<client>   Vérifie, sans rien modifier.
 *   npm run config:apply    -- config/clients/<client>   Vérifie puis installe.
 *   npm run config:reset                                  Revient à l'apparence KHentik neutre.
 *
 * Un dossier client contient :
 *   questionnaire.xlsx   l'export Excel rempli par le client (ou questionnaire.json) ;
 *   overrides.json       facultatif : les arbitrages validés (couleurs de charte,
 *                        police, documents transmis à l'IA…), avec leur raison ;
 *   documents/           créé à l'installation : les documents joints au questionnaire.
 * On peut aussi passer directement un fichier .xlsx ou .json (sans arbitrages).
 *
 * L'installation écrit :
 *   src/config/active.config.json    apparence et réglages lus par le navigateur ;
 *   functions/config/ai-profile.json style d'écriture et contexte, lus par le serveur ;
 *   public/brand/                    les logos.
 * Les versions remplacées sont gardées dans config/backups/ (non versionné).
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { buildInstance } from '../src/config/instance.mjs';
import { readAnswers } from './read-answers.mjs';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const OUT = {
  ui: path.join(ROOT, 'src/config/active.config.json'),
  ai: path.join(ROOT, 'functions/config/ai-profile.json'),
  brand: path.join(ROOT, 'public/brand'),
  backups: path.join(ROOT, 'config/backups'),
};
const REFERENCE = path.join(ROOT, 'config/khentik.reference.json');

/** Résout l'argument en { answersFile, overridesFile, clientDir }. */
export function resolveSource(arg) {
  const abs = path.resolve(process.cwd(), arg);
  if (fs.existsSync(abs) && fs.statSync(abs).isDirectory()) {
    const answersFile = ['questionnaire.xlsx', 'questionnaire.json'].map((f) => path.join(abs, f)).find((f) => fs.existsSync(f));
    if (!answersFile) throw new Error(`Aucun questionnaire.xlsx ni questionnaire.json dans ${abs}`);
    const overridesFile = path.join(abs, 'overrides.json');
    return { answersFile, overridesFile: fs.existsSync(overridesFile) ? overridesFile : null, clientDir: abs };
  }
  return { answersFile: abs, overridesFile: null, clientDir: null };
}

async function load(arg) {
  const src = resolveSource(arg);
  const answers = await readAnswers(src.answersFile);
  const overrides = src.overridesFile ? JSON.parse(fs.readFileSync(src.overridesFile, 'utf8')) : {};
  return { ...src, result: buildInstance(answers, overrides) };
}

function report({ answersFile, overridesFile, result }) {
  console.log(`\nQuestionnaire : ${path.relative(ROOT, answersFile)}`);
  if (overridesFile) console.log(`Arbitrages    : ${path.relative(ROOT, overridesFile)}`);
  if (result.ui) {
    console.log(`  Entreprise : ${result.ui.client.companyName}  ·  Nom affiché : ${result.ui.client.productName}`);
    console.log(`  Assistant : ${result.ui.assistant.name}  ·  Documents : ${result.documents.length}  ·  Textes transmis à l’IA : ${result.ai.referenceTexts.length}`);
  }
  for (const w of result.warnings) console.log(`  ⚠ ${w}`);
  for (const e of result.errors) console.log(`  ✗ ${e}`);
  console.log(result.valid ? '  ✓ Valide.' : `  ✗ Invalide (${result.errors.length} erreur${result.errors.length > 1 ? 's' : ''}).`);
  return result.valid;
}

function backup(file, stamp) {
  if (!fs.existsSync(file)) return;
  fs.mkdirSync(OUT.backups, { recursive: true });
  fs.copyFileSync(file, path.join(OUT.backups, `${stamp}-${path.basename(file)}`));
}

function install({ result, clientDir, answersFile }) {
  const stamp = new Date().toISOString().replace(/[:.]/g, '-');
  const appliedFrom = path.relative(ROOT, clientDir || answersFile).split(path.sep).join('/');
  backup(OUT.ui, stamp);
  backup(OUT.ai, stamp);
  const ui = { ...result.ui, meta: { ...result.ui.meta, appliedFrom } };
  fs.writeFileSync(OUT.ui, `${JSON.stringify(ui, null, 2)}\n`);
  fs.mkdirSync(path.dirname(OUT.ai), { recursive: true });
  fs.writeFileSync(OUT.ai, `${JSON.stringify({ ...result.ai, appliedFrom }, null, 2)}\n`);

  fs.mkdirSync(OUT.brand, { recursive: true });
  for (const f of fs.readdirSync(OUT.brand)) if (f.startsWith('logo-')) fs.rmSync(path.join(OUT.brand, f));
  for (const logo of result.logos) fs.writeFileSync(path.join(OUT.brand, logo.fileName), Buffer.from(logo.base64, 'base64'));

  if (clientDir && result.documents.length) {
    const dir = path.join(clientDir, 'documents');
    fs.mkdirSync(dir, { recursive: true });
    for (const d of result.documents) fs.writeFileSync(path.join(dir, d.fileName), Buffer.from(d.base64, 'base64'));
  }
  console.log('  → Installée : src/config/active.config.json, functions/config/ai-profile.json, public/brand/.');
  console.log('  → Anciennes versions dans config/backups/. Relancez `npm run dev` (ou reconstruisez) pour voir le résultat ;');
  console.log('    redéployez les fonctions pour que l’IA utilise le nouveau profil.');
}

async function main() {
  const [cmd, arg] = process.argv.slice(2);
  if (cmd === 'reset') {
    const loaded = await load(REFERENCE);
    if (!report(loaded)) process.exit(1);
    install(loaded);
    return;
  }
  if (!['validate', 'apply'].includes(cmd) || !arg) {
    console.log('Usage : config:validate <dossier client | fichier> · config:apply <dossier client | fichier> · config:reset');
    process.exit(2);
  }
  const loaded = await load(arg);
  const ok = report(loaded);
  if (cmd === 'validate') process.exit(ok ? 0 : 1);
  if (!ok) {
    console.log('  Rien n’a été modifié.');
    process.exit(1);
  }
  install(loaded);
}

main().catch((err) => {
  console.error(`\n✗ ${err.message}`);
  process.exit(1);
});
