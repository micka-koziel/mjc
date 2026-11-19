/**
 * Configuration Next.js.
 * SHARE_EXPORT=1 (script `npm run build:share`) : export statique de la
 * DÉMO en une page unique, fichiers relatifs, pour la partager par lien
 * (dossier out/). Sans effet sur l'application normale.
 * STATIC_EXPORT=1 (script `npm run build:netlify`) : l'APPLICATION complète
 * en fichiers statiques (dossier out/), à déposer sur Netlify : toutes les
 * pages sont statiques, les données passent par Firebase et les fonctions.
 */
const share = process.env.SHARE_EXPORT === '1';
const staticExport = process.env.STATIC_EXPORT === '1';

/** @type {import('next').NextConfig} */
const nextConfig = share
  ? { output: 'export', assetPrefix: '.', images: { unoptimized: true }, trailingSlash: false }
  : staticExport
    ? { output: 'export', images: { unoptimized: true }, trailingSlash: true }
    : {};

export default nextConfig;
