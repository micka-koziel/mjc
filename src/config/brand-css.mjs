/**
 * Variables CSS dérivées de la configuration d'instance (instance.mjs).
 * Module PUR : aucune I/O, aucune dépendance hors instance.mjs.
 */
import { withInstanceDefaults } from './instance.mjs';

/** Piles de polices. « worksans » est fournie par @fontsource/work-sans (src/app/layout.js). */
export const FONT_STACKS = Object.freeze({
  system: 'system-ui, -apple-system, "Segoe UI", Roboto, "Helvetica Neue", Arial, sans-serif',
  humanist: '"Trebuchet MS", "Segoe UI", Candara, "Lucida Grande", Verdana, sans-serif',
  serif: 'Georgia, "Iowan Old Style", "Palatino Linotype", "Times New Roman", serif',
  worksans: '"Work Sans", system-ui, -apple-system, "Segoe UI", Roboto, Arial, sans-serif',
});

function hexToRgb(hex) {
  const n = parseInt(String(hex).slice(1), 16);
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
}

function rgbToHex([r, g, b]) {
  return `#${[r, g, b].map((v) => Math.round(v).toString(16).padStart(2, '0')).join('')}`.toUpperCase();
}

/** Mélange deux couleurs (t = part de la seconde, 0..1). */
export function mix(hexA, hexB, t) {
  const a = hexToRgb(hexA);
  const b = hexToRgb(hexB);
  return rgbToHex(a.map((v, i) => v + (b[i] - v) * t));
}

function luminance(hex) {
  const [r, g, b] = hexToRgb(hex).map((v) => {
    const c = v / 255;
    return c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
  });
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
}

export function contrastRatio(hexA, hexB) {
  const [l1, l2] = [luminance(hexA), luminance(hexB)].sort((x, y) => y - x);
  return (l1 + 0.05) / (l2 + 0.05);
}

/** Texte lisible sur une couleur de fond (blanc ou quasi-noir). */
export function readableOn(hex) {
  return contrastRatio(hex, '#FFFFFF') >= contrastRatio(hex, '#111827') ? '#FFFFFF' : '#111827';
}

/** Assombrit une couleur jusqu'à un contraste de 4,5 sur le fond (lisibilité d'un texte). */
export function readableTextColor(hex, background = '#FFFFFF') {
  let c = hex;
  for (let i = 0; i < 10 && contrastRatio(c, background) < 4.5; i += 1) c = mix(c, '#000000', 0.12);
  return c;
}

/**
 * Variables CSS posées sur <html>. Les thèmes clair et sombre ont des
 * neutres fixes (globals.css) ; la configuration ne surcharge que le thème
 * clair (fond, texte, liens, succès) et les couleurs de marque.
 * @returns {Record<string, string>}
 */
export function brandCssVariables(cfg) {
  const conf = withInstanceDefaults(cfg);
  const { primary, accent, background, text, link, success } = conf.brand.colors;
  const bg = background || '#FFFFFF';
  const font = FONT_STACKS[conf.appearance.font] || FONT_STACKS.system;
  const vars = {
    '--q-primary': primary,
    '--q-primary-foreground': readableOn(primary),
    '--q-primary-soft': mix(primary, '#FFFFFF', 0.86),
    '--q-primary-strong': mix(primary, '#000000', 0.18),
    '--q-primary-soft-dark': mix(primary, '#0F1218', 0.78),
    '--q-link-light': readableTextColor(link || primary, bg),
    '--q-link-dark': contrastRatio(link || primary, '#0F1218') >= 4.5 ? link || primary : mix(link || primary, '#FFFFFF', 0.55),
    '--q-accent': accent,
    '--q-accent-foreground': readableOn(accent),
    '--q-font': font,
    '--q-font-title': FONT_STACKS[conf.appearance.titleFont] || font,
    '--q-text-scale': conf.appearance.textSize === 'large' ? '1.125' : '1',
    '--q-row-pad': conf.appearance.density === 'compact' ? '0.375rem' : '0.75rem',
  };
  if (background) {
    vars['--q-bg-custom'] = background;
    vars['--q-elevated-custom'] = mix(background, '#000000', 0.04);
    vars['--q-border-custom'] = mix(background, '#000000', 0.1);
  }
  if (text) {
    vars['--q-fg-custom'] = readableTextColor(text, bg);
    vars['--q-muted-custom'] = readableTextColor(mix(text, bg, 0.35), bg);
  }
  if (success) vars['--q-success-custom'] = readableTextColor(success, bg);
  return vars;
}
