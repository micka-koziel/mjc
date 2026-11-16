import { defineConfig, globalIgnores } from 'eslint/config';
import nextVitals from 'eslint-config-next/core-web-vitals';
import prettier from 'eslint-config-prettier/flat';

const eslintConfig = defineConfig([
  ...nextVitals,

  // Désactive les règles ESLint qui entrent en conflit avec Prettier
  // (Prettier gère le formatage, ESLint gère la qualité)
  prettier,

  // Règles custom — standard Mickaël
  {
    rules: {
      // Sprint 71 — ignoreRestSiblings : autorise le pattern d'omission par
      // destructuring `const { aExclure, ...reste } = obj` (utilisé par le
      // framework, ex. relatedListsFromSchema). Les vraies variables mortes
      // restent signalées.
      'no-unused-vars': ['warn', { ignoreRestSiblings: true }],
      'no-console': ['warn', { allow: ['warn', 'error'] }],
      eqeqeq: 'error',
      'prefer-const': 'error',
      'no-var': 'error',
    },
  },

  // Scripts CLI locaux (seed / backfill / migrate) : console.log est le
  // mécanisme normal de feedback en ligne de commande pour un script run
  // à la main, pas de la dette. On désactive no-console uniquement là.
  {
    files: ['scripts/**', 'functions/scripts/**'],
    rules: { 'no-console': 'off' },
  },

  // Ignores
  globalIgnores(['.next/**', 'out/**', 'build/**', 'node_modules/**', 'next-env.d.ts']),
]);

export default eslintConfig;
