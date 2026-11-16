/**
 * Setup global Vitest pour les tests frontend (jsdom).
 *
 * Charge les matchers @testing-library/jest-dom (toBeInTheDocument,
 * toHaveClass, etc.) directement dans expect.
 *
 * Sprint 14 — ce fichier est référencé par vitest.config.js (projets.frontend).
 */
import '@testing-library/jest-dom/vitest';

// Sprint 107 — pas de délai d'annulation d'envoi dans les tests (20 s en vrai).
globalThis.__Q_UNDO_SECONDS__ = 0;
