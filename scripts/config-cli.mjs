#!/usr/bin/env node
/**
 * Outil de configuration de l'instance (utilisé par l'agent de personnalisation).
 *
 *   npm run config:validate -- <export.json>   Vérifie un export du questionnaire.
 *   npm run config:apply    -- <export.json>   Vérifie puis l'installe comme
 *                                              configuration active.
 *   npm run config:reset                       Revient à la référence KHentik.
 *
 * La configuration active est src/config/active.config.json : l'application
 * la lit au démarrage (relancer `npm run dev`, ou reconstruire en production).
 * Une copie de la configuration remplacée est gardée dans config/backups/.
 * Le logo voyage DANS le JSON (data URL) : aucun fichier à copier à part.
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { validateConfig, withDefaults } from '../src/config/contract.mjs';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const ACTIVE = path.join(ROOT, 'src/config/active.config.json');
const REFERENCE = path.join(ROOT, 'config/khentik.reference.json');
const BACKUPS = path.join(ROOT, 'config/backups');

function readJson(file) {
  const abs = path.resolve(process.cwd(), file);
  if (!fs.existsSync(abs)) throw new Error(`Fichier introuvable : ${abs}`);
  try {
    return JSON.parse(fs.readFileSync(abs, 'utf8'));
  } catch (err) {
    throw new Error(`JSON illisible (${err.message}).`);
  }
}

function report(cfg, file) {
  const { valid, errors, warnings } = validateConfig(cfg);
  console.log(`\nConfiguration : ${file}`);
  console.log(`  Entreprise : ${cfg?.client?.companyName || '?'}  ·  Produit : ${cfg?.client?.productName || '?'}${cfg?.client?.isFictional ? '  ·  (FICTIF)' : ''}`);
  for (const w of warnings) console.log(`  ⚠ ${w}`);
  for (const e of errors) console.log(`  ✗ ${e}`);
  console.log(valid ? '  ✓ Valide.' : `  ✗ Invalide (${errors.length} erreur${errors.length > 1 ? 's' : ''}).`);
  return valid;
}

function install(cfg, source) {
  fs.mkdirSync(BACKUPS, { recursive: true });
  if (fs.existsSync(ACTIVE)) {
    const stamp = new Date().toISOString().replace(/[:.]/g, '-');
    fs.copyFileSync(ACTIVE, path.join(BACKUPS, `active-${stamp}.json`));
  }
  const toWrite = { ...withDefaults(cfg), meta: { ...(cfg.meta || {}), appliedAt: new Date().toISOString(), appliedFrom: source } };
  fs.writeFileSync(ACTIVE, `${JSON.stringify(toWrite, null, 2)}\n`);
  console.log(`  → Installée dans src/config/active.config.json (ancienne version sauvegardée dans config/backups/).`);
  console.log('  → Relancez `npm run dev` (ou `npm run build`) pour voir le résultat.');
}

const [cmd, file] = process.argv.slice(2);
try {
  if (cmd === 'validate') {
    if (!file) throw new Error('Indiquez le fichier : npm run config:validate -- export.json');
    process.exit(report(readJson(file), file) ? 0 : 1);
  } else if (cmd === 'apply') {
    if (!file) throw new Error('Indiquez le fichier : npm run config:apply -- export.json');
    const cfg = readJson(file);
    if (!report(cfg, file)) {
      console.log('  Rien n’a été modifié.');
      process.exit(1);
    }
    install(cfg, path.basename(file));
  } else if (cmd === 'reset') {
    const cfg = readJson(REFERENCE);
    report(cfg, 'config/khentik.reference.json');
    install(cfg, 'khentik.reference.json');
  } else {
    console.log('Usage : config:validate <fichier> | config:apply <fichier> | config:reset');
    process.exit(2);
  }
} catch (err) {
  console.error(`\n✗ ${err.message}`);
  process.exit(1);
}
