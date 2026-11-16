#!/usr/bin/env node
/**
 * Construit questionnaire/questionnaire.html (fichier unique, autonome) en y
 * recopiant le contrat de configuration src/config/contract.mjs : le
 * questionnaire, l'application et l'outil agent utilisent ainsi EXACTEMENT
 * les mêmes règles. À relancer après toute modification du contrat.
 */
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const contractSrc = fs.readFileSync(path.join(ROOT, 'src/config/contract.mjs'), 'utf8');
export const toBrowser = (src) => src.replace(/^export\s+/gm, '');
const template = fs.readFileSync(path.join(ROOT, 'questionnaire/src/questionnaire.template.html'), 'utf8');
const hash = crypto.createHash('sha256').update(contractSrc).digest('hex').slice(0, 12);
const out = template.replace('/*__CONTRACT__*/', `/* contract.mjs sha256:${hash} */\n${toBrowser(contractSrc)}`);
fs.writeFileSync(path.join(ROOT, 'questionnaire/questionnaire.html'), out);
console.log(`questionnaire/questionnaire.html construit (contrat sha256:${hash}).`);
