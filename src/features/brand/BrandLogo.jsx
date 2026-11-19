'use client';

import { brandConfig } from './brand';

/**
 * Logo de l'instance (fichiers public/brand/, installés par config:apply) :
 * variante sombre si le thème est sombre et qu'elle existe, sinon pastille
 * + nom. Hauteur 48 px et largeur 160 px au plus : convient aux logos hauts
 * comme aux logos larges. `compact` : pastille seule (barre latérale réduite).
 */
export function BrandLogo({ compact = false }) {
  const { logo } = brandConfig.brand;
  const name = brandConfig.client.productName;
  if (!compact && (logo.light || logo.dark)) {
    const light = logo.light || logo.dark;
    const dark = logo.dark || light;
    return (
      <span className="flex flex-col items-start" title={name}>
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src={light} alt={name} className="q-logo-light h-auto max-h-12 w-auto max-w-[160px] object-contain object-left" />
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src={dark} alt="" aria-hidden="true" className="q-logo-dark h-auto max-h-12 w-auto max-w-[160px] object-contain object-left" />
      </span>
    );
  }
  return (
    <span className="flex items-center gap-2" title={name}>
      <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-primary text-sm font-bold text-primary-foreground">
        {name.slice(0, 1).toUpperCase()}
      </span>
      {!compact && <span className="truncate text-base font-semibold text-foreground">{name}</span>}
    </span>
  );
}
