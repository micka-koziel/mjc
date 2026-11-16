#!/usr/bin/env node
/**
 * Vérifie que le package ne dépend d'aucun module exclu (CRM, recouvrement…).
 * Analyse le CODE (commentaires retirés) du front (src/) et des fonctions.
 * Sortie non nulle si une dépendance interdite est trouvée.
 */
import fs from 'node:fs';
import path from 'node:path';

const ROOTS = ['src', 'functions'];
const FORBIDDEN = [
  [/collection\(\s*(?:db\s*,\s*)?['"](opportunities|collaborations|brands|creators|agencies|individuals|sollicitations|events|interactions|offers|recovery)['"]/, 'collection CRM / métier exclue'],
  [/features\/(opportunities|collaborations|recovery|brands|creators|agencies|individuals|prospection|radar|veille|pilotage|des|sollicitations|_entity-framework)\b/, 'import d’un module exclu'],
  [/createOpportunityFromEmail|createRecordFromSuggestion|label_opportunity|alfredExecute|crmAssistant/, 'appel CRM'],
  [/Cap AI|PipelineBand|CockpitKpis|classifPalette/, 'bloc retiré'],
];

function stripComments(src) {
  return src.replace(/\/\*[\s\S]*?\*\//g, '').replace(/(^|[^:"'`])\/\/.*$/gm, '$1');
}
function walk(dir, out = []) {
  for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
    if (e.name === 'node_modules' || e.name.startsWith('.')) continue;
    const p = path.join(dir, e.name);
    if (e.isDirectory()) walk(p, out);
    else if (/\.(m?js|jsx)$/.test(e.name) && !/\.test\./.test(e.name)) out.push(p);
  }
  return out;
}

const hits = [];
for (const root of ROOTS) {
  for (const file of walk(root)) {
    const code = stripComments(fs.readFileSync(file, 'utf8'));
    for (const [re, why] of FORBIDDEN) {
      const m = code.match(re);
      if (m) hits.push(`${file} : ${why} (« ${m[0]} »)`);
    }
  }
}
if (hits.length) {
  console.error(`✗ ${hits.length} dépendance(s) interdite(s) :\n  ${hits.join('\n  ')}`);
  process.exit(1);
}
console.log('✓ Aucune dépendance CRM / recouvrement / module exclu dans src/ et functions/.');
