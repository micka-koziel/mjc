/**
 * Configuration Next.js.
 * SHARE_EXPORT=1 (script `npm run build:share`) : export statique de la
 * DÉMO en une page unique, fichiers relatifs, pour la partager par lien
 * (dossier out/). Sans effet sur l'application normale.
 */
const share = process.env.SHARE_EXPORT === '1';

/** @type {import('next').NextConfig} */
const nextConfig = share
  ? { output: 'export', assetPrefix: '.', images: { unoptimized: true }, trailingSlash: false }
  : {};

export default nextConfig;
