#!/usr/bin/env node
/**
 * Construit share/index.html : la DÉMO en un seul fichier HTML autonome
 * (JavaScript et CSS intégrés), à publier ou envoyer tel quel.
 * Mode démo forcé (données fictives, aucun envoi), navigation par ancre.
 * Le CSS vient de l'export Next (`npm run build:share` doit précéder).
 */
import fs from 'node:fs';
import path from 'node:path';
import { build } from 'esbuild';

const root = process.cwd();
const result = await build({
  entryPoints: ['share-src/entry.jsx'],
  bundle: true,
  minify: true,
  write: false,
  format: 'iife',
  jsx: 'automatic',
  target: ['es2020'],
  loader: { '.js': 'jsx' },
  alias: {
    '@': path.join(root, 'src'),
    'next/link': path.join(root, 'share-src/next-link.jsx'),
    'next/navigation': path.join(root, 'share-src/next-navigation.js'),
  },
  define: {
    'process.env.NEXT_PUBLIC_HASH_ROUTING': '"1"',
    'process.env.NEXT_PUBLIC_DATA_MODE': '"demo"',
    'process.env.NODE_ENV': '"production"',
  },
});
const js = result.outputFiles[0].text.replaceAll('</script', '<\\/script');
const cssDir = 'out/_next/static/chunks';
const cssFile = fs.readdirSync(cssDir).find((f) => f.endsWith('.css'));
if (!cssFile) throw new Error('CSS introuvable : lancez d’abord `npm run build:share`.');
const css = fs.readFileSync(path.join(cssDir, cssFile), 'utf8');
const page = `<!DOCTYPE html>
<html lang="fr"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1">
<title>Démonstration</title><style>${css}</style></head>
<body><div id="root"></div><script>${js}</script></body></html>
`;
fs.rmSync('share', { recursive: true, force: true });
fs.mkdirSync('share');
fs.writeFileSync('share/index.html', page);
console.log(`share/index.html : ${(page.length / 1024).toFixed(0)} Ko`);
