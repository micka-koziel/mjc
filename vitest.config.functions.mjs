import { defineConfig } from 'vitest/config';

/** Tests des Cloud Functions (environnement Node), lancés par `npm run test:functions`. */
export default defineConfig({
  test: {
    environment: 'node',
    globals: true,
    include: ['functions/**/*.test.{js,ts}'],
    exclude: ['**/node_modules/**'],
  },
});
