import { defineConfig } from 'vitest/config';
import react from '@vitejs/plugin-react';
import { fileURLToPath } from 'node:url';

/**
 * Configuration Vitest — refonte Sprint 18.
 *
 * Sprint 17 avait expérimenté la feature `projects` (workspace Vitest 2+)
 * pour faire cohabiter tests frontend (jsdom) et tests Cloud Functions
 * (node). Verdict : 4 pièges bloquants (alias non hérité, __dirname ESM,
 * env jsdom non appliqué, JSX transform absente). Reporté Sprint 18.
 *
 * Sprint 18 — architecture simplifiée :
 *   - 1 seul environnement par défaut : jsdom (compatible aussi avec
 *     les tests purs Node car jsdom = surensemble de node pour le code
 *     applicatif standard).
 *   - Plugin React `@vitejs/plugin-react` activé globalement pour la
 *     transform JSX automatique (plus besoin d'importer React dans les
 *     tests ni les sources).
 *   - Alias `@/` résolu via `fileURLToPath(new URL('./src', import.meta.url))`,
 *     pattern ESM-friendly (pas de __dirname).
 *   - setupFiles : vitest.setup.js (matchers jest-dom).
 *
 * Cloud Functions (functions/**) : tests Node spécifiques exécutés par un
 * script séparé `npm run test:functions` qui pointe sur
 * `vitest.config.functions.js` (config minimaliste env: node).
 *
 * Pour lancer :
 *   - npm test                 → tous les tests src/ en jsdom (par défaut)
 *   - npm run test:watch       → mode watch interactif
 *   - npm run test:functions   → tests Cloud Functions en env node
 */
export default defineConfig({
  plugins: [react()],
  resolve: {
    alias: {
      '@': fileURLToPath(new URL('./src', import.meta.url)),
    },
  },
  test: {
    environment: 'jsdom',
    globals: true,
    setupFiles: ['./vitest.setup.js'],
    include: ['src/**/*.test.{js,jsx,ts,tsx}', 'scripts/**/*.test.mjs'],
    exclude: [
      '**/node_modules/**',
      '**/.next/**',
      '**/dist/**',
      'functions/**',
    ],
  },
});
