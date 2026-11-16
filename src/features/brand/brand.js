/**
 * Configuration de marque ACTIVE de l'instance (copiée par `npm run config:apply`).
 */
import activeConfig from '@/config/active.config.json';
import { brandCssVariables, withDefaults } from '@/config/contract.mjs';

export const brandConfig = withDefaults(activeConfig);
export const brandVariables = brandCssVariables(brandConfig);
