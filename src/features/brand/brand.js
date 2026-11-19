/**
 * Configuration ACTIVE de l'instance (installée par `npm run config:apply`).
 * Seule la partie « interface » arrive ici : le style d'écriture et le
 * contexte métier restent côté serveur (functions/config/ai-profile.json).
 */
import activeConfig from '@/config/active.config.json';
import { withInstanceDefaults } from '@/config/instance.mjs';
import { brandCssVariables } from '@/config/brand-css.mjs';

export const brandConfig = withInstanceDefaults(activeConfig);
export const brandVariables = brandCssVariables(brandConfig);

/** Attributs posés sur <html> : thème, angles, contraste (lus par globals.css). */
export const brandDataset = Object.freeze({
  'data-theme': brandConfig.appearance.theme,
  'data-corners': brandConfig.appearance.corners,
  'data-contrast': brandConfig.appearance.contrast,
});
