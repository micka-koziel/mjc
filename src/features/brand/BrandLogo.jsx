'use client';

import { brandConfig } from './brand';

/**
 * Logo de l’instance : image embarquée de la configuration, hauteur 48 px max
 * et largeur 160 px max (s’adapte aux logos larges comme aux logos hauts ; variante sombre
 * si le thème est sombre et qu'elle existe), sinon pastille + nom du produit.
 */
export function BrandLogo({ compact = false }) {
  const { logo } = brandConfig.brand;
  const name = brandConfig.client.productName;
  if (logo.light?.dataUrl || logo.dark?.dataUrl) {
    const light = logo.light?.dataUrl || logo.dark?.dataUrl;
    const dark = logo.dark?.dataUrl || light;
    return (
      <span className="flex flex-col items-start" title={name}>
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src={light} alt={name} className="q-logo-light h-auto max-h-12 w-auto max-w-[160px] object-contain object-left" />
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src={dark} alt="" aria-hidden="true" className="q-logo-dark h-auto max-h-12 w-auto max-w-[160px] object-contain object-left" />
        {!compact && <span className="mt-0.5 text-xs font-medium text-muted">{name}</span>}
      </span>
    );
  }
  return (
    <span className="flex items-center gap-2" title={name}>
      <span className="flex h-8 w-8 items-center justify-center rounded-lg bg-primary text-sm font-bold text-primary-foreground">
        {name.slice(0, 1).toUpperCase()}
      </span>
      {!compact && <span className="truncate text-base font-semibold text-foreground">{name}</span>}
    </span>
  );
}
