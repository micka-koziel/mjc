/**
 * Contrat de configuration KHentik — SOURCE UNIQUE.
 *
 * Ce fichier est utilisé tel quel par :
 *  - l'application (src/features/brand) pour appliquer la marque ;
 *  - le script agent `npm run config:apply` (scripts/config-cli.mjs) ;
 *  - le questionnaire client : `npm run questionnaire:build` recopie ce
 *    fichier dans questionnaire/questionnaire.html (bloc « contract »).
 * Ne pas dupliquer ces règles ailleurs : modifier ici, puis reconstruire le
 * questionnaire.
 *
 * Module PUR : aucune I/O, aucune dépendance (ni React, ni Node).
 */

export const SCHEMA_VERSION = '1.0';

/** Valeurs autorisées (clé technique → libellé affiché). */
export const ALLOWED = Object.freeze({
  theme: { light: 'Clair', dark: 'Sombre', system: 'Selon l’appareil' },
  font: { system: 'Moderne', humanist: 'Douce', serif: 'Classique' },
  density: { comfortable: 'Aérée', compact: 'Compacte' },
  textSize: { normal: 'Normale', large: 'Grande' },
  tone: { cordial: 'Cordial', professional: 'Professionnel', direct: 'Direct' },
  concision: { short: 'Court', balanced: 'Équilibré', detailed: 'Détaillé' },
  language: { fr: 'Français', en: 'Anglais' },
  emailTypes: {
    customers: 'Demandes de clients',
    orders: 'Commandes et livraisons',
    suppliers: 'Fournisseurs',
    quotes: 'Devis',
    billing: 'Factures et paiements',
    partners: 'Partenaires',
    recruiting: 'Candidatures',
    admin: 'Administration',
    newsletters: 'Newsletters',
    other: 'Autre',
  },
});

/** Piles de polices réellement chargées (polices système, aucun téléchargement). */
export const FONT_STACKS = Object.freeze({
  system: 'system-ui, -apple-system, "Segoe UI", Roboto, "Helvetica Neue", Arial, sans-serif',
  humanist: '"Trebuchet MS", "Segoe UI", Candara, "Lucida Grande", Verdana, sans-serif',
  serif: 'Georgia, "Iowan Old Style", "Palatino Linotype", "Times New Roman", serif',
});

/** Logo : formats et taille acceptés (la donnée est embarquée dans le JSON). */
export const LOGO_RULES = Object.freeze({
  mimeTypes: ['image/png', 'image/jpeg', 'image/webp', 'image/svg+xml'],
  maxBytes: 300 * 1024,
});

/**
 * Couleurs de marque KHentik, reprises de l'application khentik-app
 * (src/app/globals.css : or #A9883A en thème clair, bleu nuit #0C1929).
 */
export const KHENTIK_DEFAULT_COLORS = Object.freeze({ primary: '#A9883A', accent: '#0C1929' });

export const DEFAULT_CONFIG = Object.freeze({
  schemaVersion: SCHEMA_VERSION,
  client: {
    companyName: 'KHentik',
    productName: 'KHentik Email',
    website: '',
    isFictional: false,
  },
  brand: {
    logo: { light: null, dark: null },
    // background : couleur de fond du thème clair (null = fond neutre par défaut).
    colors: { useKHentikDefaults: true, ...KHENTIK_DEFAULT_COLORS, background: null },
  },
  // titleFont : police des titres (null = même police que le texte).
  appearance: { theme: 'light', font: 'system', titleFont: null, density: 'comfortable', textSize: 'normal' },
  assistant: { name: 'Assistant', tone: 'cordial', concision: 'balanced', language: 'fr' },
  context: {
    applied: false,
    activity: '',
    emailTypes: [],
    priorityExpectations: '',
    importantSenders: '',
    notes: '',
  },
  meta: { exportedAt: null, source: 'default' },
});

const HEX = /^#[0-9a-fA-F]{6}$/;
const DATA_URL = /^data:(image\/(?:png|jpeg|webp|svg\+xml));base64,([A-Za-z0-9+/=]+)$/;

function isObj(v) {
  return v !== null && typeof v === 'object' && !Array.isArray(v);
}

function str(v) {
  return typeof v === 'string' ? v.trim() : '';
}

/** Taille réelle (octets) d'un contenu base64. */
export function base64Bytes(b64) {
  const s = String(b64 || '');
  const pad = s.endsWith('==') ? 2 : s.endsWith('=') ? 1 : 0;
  return Math.floor((s.length * 3) / 4) - pad;
}

function checkLogo(logo, path, errors) {
  if (logo === null || logo === undefined) return;
  if (!isObj(logo)) {
    errors.push(`${path} : objet attendu ou null.`);
    return;
  }
  const m = DATA_URL.exec(String(logo.dataUrl || ''));
  if (!m) {
    errors.push(
      `${path}.dataUrl : image embarquée attendue (data:image/png|jpeg|webp|svg+xml;base64,…). ` +
        'Un chemin de fichier ou une URL temporaire ne survit pas à l’export.'
    );
    return;
  }
  if (logo.mimeType && logo.mimeType !== m[1]) errors.push(`${path}.mimeType ne correspond pas au contenu.`);
  if (base64Bytes(m[2]) > LOGO_RULES.maxBytes) {
    errors.push(`${path} : ${Math.round(base64Bytes(m[2]) / 1024)} Ko, maximum ${LOGO_RULES.maxBytes / 1024} Ko.`);
  }
}

function checkEnum(value, key, path, errors) {
  if (!Object.prototype.hasOwnProperty.call(ALLOWED[key], value)) {
    errors.push(`${path} : « ${value} » non autorisé (${Object.keys(ALLOWED[key]).join(', ')}).`);
  }
}

/**
 * Valide une configuration (telle qu'exportée par le questionnaire).
 * @param {unknown} cfg
 * @returns {{valid: boolean, errors: string[], warnings: string[]}}
 */
export function validateConfig(cfg) {
  const errors = [];
  const warnings = [];
  if (!isObj(cfg)) return { valid: false, errors: ['Configuration : objet JSON attendu.'], warnings };

  if (cfg.schemaVersion !== SCHEMA_VERSION) {
    errors.push(`schemaVersion : « ${cfg.schemaVersion} » reçu, « ${SCHEMA_VERSION} » attendu.`);
  }

  const c = cfg.client;
  if (!isObj(c)) errors.push('client : section obligatoire.');
  else {
    if (!str(c.companyName)) errors.push('client.companyName : obligatoire.');
    if (str(c.companyName).length > 80) errors.push('client.companyName : 80 caractères maximum.');
    if (!str(c.productName)) errors.push('client.productName : obligatoire.');
    if (str(c.productName).length > 40) errors.push('client.productName : 40 caractères maximum.');
    if (str(c.website) && !/^https?:\/\/[^\s.]+\.[^\s]+$/i.test(str(c.website))) {
      errors.push('client.website : adresse web invalide (https://…).');
    }
    if (typeof c.isFictional !== 'boolean') errors.push('client.isFictional : vrai ou faux attendu.');
  }

  const b = cfg.brand;
  if (!isObj(b)) errors.push('brand : section obligatoire.');
  else {
    if (!isObj(b.logo)) errors.push('brand.logo : section obligatoire ({light, dark}, chacun null ou image).');
    else {
      checkLogo(b.logo.light, 'brand.logo.light', errors);
      checkLogo(b.logo.dark, 'brand.logo.dark', errors);
    }
    const col = b.colors;
    if (!isObj(col)) errors.push('brand.colors : section obligatoire.');
    else {
      if (typeof col.useKHentikDefaults !== 'boolean') {
        errors.push('brand.colors.useKHentikDefaults : vrai ou faux attendu.');
      }
      for (const k of ['primary', 'accent']) {
        if (!HEX.test(String(col[k] || ''))) errors.push(`brand.colors.${k} : code couleur #RRGGBB attendu.`);
      }
      if (HEX.test(String(col.primary || '')) && contrastRatio(col.primary, '#FFFFFF') < 3 && contrastRatio(col.primary, '#111827') < 3) {
        warnings.push('brand.colors.primary : contraste faible avec le texte, lisibilité réduite.');
      }
      // Facultatif : absent ou null = fond neutre.
      if (col.background !== undefined && col.background !== null) {
        if (!HEX.test(String(col.background))) errors.push('brand.colors.background : code couleur #RRGGBB ou null attendu.');
        else if (contrastRatio(col.background, '#111827') < 4.5) {
          warnings.push('brand.colors.background : fond trop foncé, le texte sera difficile à lire.');
        }
      }
    }
  }

  const a = cfg.appearance;
  if (!isObj(a)) errors.push('appearance : section obligatoire.');
  else {
    checkEnum(a.theme, 'theme', 'appearance.theme', errors);
    checkEnum(a.font, 'font', 'appearance.font', errors);
    // Facultatif : absent ou null = même police que le texte.
    if (a.titleFont !== undefined && a.titleFont !== null) checkEnum(a.titleFont, 'font', 'appearance.titleFont', errors);
    checkEnum(a.density, 'density', 'appearance.density', errors);
    checkEnum(a.textSize, 'textSize', 'appearance.textSize', errors);
  }

  const s = cfg.assistant;
  if (!isObj(s)) errors.push('assistant : section obligatoire.');
  else {
    if (!str(s.name)) errors.push('assistant.name : obligatoire.');
    if (str(s.name).length > 30) errors.push('assistant.name : 30 caractères maximum.');
    checkEnum(s.tone, 'tone', 'assistant.tone', errors);
    checkEnum(s.concision, 'concision', 'assistant.concision', errors);
    checkEnum(s.language, 'language', 'assistant.language', errors);
  }

  const x = cfg.context;
  if (!isObj(x)) errors.push('context : section obligatoire.');
  else {
    if (x.applied !== false) errors.push('context.applied : doit valoir false (contexte non appliqué automatiquement).');
    if (!Array.isArray(x.emailTypes)) errors.push('context.emailTypes : liste attendue.');
    else for (const t of x.emailTypes) checkEnum(t, 'emailTypes', 'context.emailTypes', errors);
    for (const k of ['activity', 'priorityExpectations', 'importantSenders', 'notes']) {
      if (x[k] !== undefined && typeof x[k] !== 'string') errors.push(`context.${k} : texte attendu.`);
      if (typeof x[k] === 'string' && x[k].length > 2000) errors.push(`context.${k} : 2 000 caractères maximum.`);
    }
  }

  // Champs interdits : aucun secret ne doit transiter par ce contrat.
  const flat = JSON.stringify(cfg).toLowerCase();
  for (const forbidden of ['"password"', '"apikey"', '"api_key"', '"secret"', '"token"']) {
    if (flat.includes(forbidden)) errors.push(`Champ interdit détecté (${forbidden}) : aucun secret dans la configuration.`);
  }

  return { valid: errors.length === 0, errors, warnings };
}

/**
 * Complète une configuration partielle avec les valeurs par défaut (sans
 * valider). Utile pour l'aperçu du questionnaire et le chargement dans l'app.
 */
export function withDefaults(cfg = {}) {
  const d = DEFAULT_CONFIG;
  const c = isObj(cfg) ? cfg : {};
  const colors = { ...d.brand.colors, ...(c.brand?.colors || {}) };
  if (colors.useKHentikDefaults) Object.assign(colors, KHENTIK_DEFAULT_COLORS);
  return {
    schemaVersion: SCHEMA_VERSION,
    client: { ...d.client, ...(c.client || {}) },
    brand: {
      logo: { ...d.brand.logo, ...(c.brand?.logo || {}) },
      colors,
    },
    appearance: { ...d.appearance, ...(c.appearance || {}) },
    assistant: { ...d.assistant, ...(c.assistant || {}) },
    context: { ...d.context, ...(c.context || {}), applied: false },
    meta: { ...d.meta, ...(c.meta || {}) },
  };
}

// ---- Couleurs (dérivation des teintes appliquées à l'interface) -----------

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

/**
 * Variables CSS dérivées de la configuration. Les thèmes clair et sombre
 * sont fixes (neutres) ; seules les couleurs de marque varient.
 * @returns {Record<string, string>}
 */
export function brandCssVariables(cfg) {
  const conf = withDefaults(cfg);
  const { primary, accent, background } = conf.brand.colors;
  const font = FONT_STACKS[conf.appearance.font] || FONT_STACKS.system;
  // Fond personnalisé (thème clair) : zones en relief et bordures en dérivent
  // pour rester dans la même famille de teintes.
  const ground = background
    ? {
        '--q-bg-custom': background,
        '--q-elevated-custom': mix(background, '#000000', 0.04),
        '--q-border-custom': mix(background, '#000000', 0.1),
      }
    : {};
  return {
    '--q-primary': primary,
    '--q-primary-foreground': readableOn(primary),
    '--q-primary-soft': mix(primary, '#FFFFFF', 0.86),
    '--q-primary-strong': mix(primary, '#000000', 0.18),
    // Variantes pour le thème sombre (fond teinté foncé, texte de lien clair).
    '--q-primary-soft-dark': mix(primary, '#0F1218', 0.78),
    '--q-link-light': contrastRatio(primary, '#FFFFFF') >= 4.5 ? primary : mix(primary, '#000000', 0.35),
    '--q-link-dark': contrastRatio(primary, '#0F1218') >= 4.5 ? primary : mix(primary, '#FFFFFF', 0.55),
    '--q-accent': accent,
    '--q-accent-foreground': readableOn(accent),
    '--q-font': font,
    '--q-font-title': FONT_STACKS[conf.appearance.titleFont] || font,
    '--q-text-scale': conf.appearance.textSize === 'large' ? '1.125' : '1',
    '--q-row-pad': conf.appearance.density === 'compact' ? '0.375rem' : '0.75rem',
    ...ground,
  };
}
