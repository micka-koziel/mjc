/**
 * Configuration d'INSTANCE — ce que l'application et ses fonctions serveur
 * utilisent réellement, construit à partir des réponses au questionnaire v2.
 *
 *   réponses (questionnaire-v2.mjs) + arbitrages (overrides.json)
 *        └─► buildInstance()
 *              ├─ ui    → src/config/active.config.json    (navigateur)
 *              ├─ ai    → functions/config/ai-profile.json  (serveur seulement)
 *              ├─ logos → public/brand/                     (fichiers)
 *              └─ documents → config/clients/<client>/documents/
 *
 * Séparation volontaire : le style d'écriture et le contexte métier ne
 * partent jamais dans le navigateur ; les gros documents ne sont jamais
 * embarqués dans l'application.
 *
 * Module PUR : aucune I/O, aucune dépendance hors questionnaire-v2.mjs.
 */
import { ALLOWED, HEX, isObj, parseDataUrl, validateAnswers } from './questionnaire-v2.mjs';

export const INSTANCE_VERSION = 1;

/**
 * Polices de l'instance : celles du questionnaire, plus des polices de
 * charte réservées aux arbitrages (overrides). « worksans » est chargée par
 * l'application (paquet @fontsource/work-sans).
 */
export const FONTS = Object.freeze({ ...ALLOWED.font, worksans: 'Work Sans' });

/** Apparence neutre du produit, quand une valeur manque. */
export const DEFAULT_UI = Object.freeze({
  instanceVersion: INSTANCE_VERSION,
  client: { companyName: 'KHentik', productName: 'KHentik Email', website: '', isFictional: false, ownerFirstName: '' },
  brand: {
    logo: { light: null, dark: null },
    colors: { primary: '#A9883A', accent: '#0C1929', background: null, text: null, link: null, success: null },
  },
  appearance: {
    theme: 'light',
    font: 'system',
    titleFont: null,
    density: 'comfortable',
    textSize: 'normal',
    layout: 'balanced',
    messagePreview: 'two',
    sidebar: 'expanded',
    corners: 'soft',
    contrast: 'standard',
  },
  assistant: {
    name: 'Assistant',
    tagline: 'Votre assistant pour les e-mails',
    welcome: '',
    avatar: null,
    tone: 'cordial',
    concision: 'balanced',
    language: 'fr',
  },
  priorities: { importantSenders: [] },
  meta: { source: 'default' },
});

/** Réglages lus mais pas encore appliqués par l'application, avec leur valeur neutre (signalés à l'import s'ils en diffèrent). */
export const NOT_YET_APPLIED = Object.freeze({
  'appearance.layout': 'balanced',
  'brand.extra.style': 'balanced',
  'brand.extra.secondary': null,
});

const MIME_EXT = { 'image/png': 'png', 'image/jpeg': 'jpg', 'image/webp': 'webp', 'image/svg+xml': 'svg' };
const MAX_REFERENCE_CHARS = 24000;

/** Fusion profonde : les objets se fusionnent, le reste est remplacé. */
export function deepMerge(base, extra) {
  if (!isObj(base) || !isObj(extra)) return extra === undefined ? base : extra;
  const out = { ...base };
  for (const [k, v] of Object.entries(extra)) out[k] = isObj(v) && isObj(base[k]) ? deepMerge(base[k], v) : v;
  return out;
}

/** Complète une configuration d'interface partielle avec les valeurs neutres. */
export function withInstanceDefaults(ui = {}) {
  return deepMerge(DEFAULT_UI, isObj(ui) ? ui : {});
}

/** « annie do, bastien frappart » → ['annie do', 'bastien frappart']. */
export function splitList(text) {
  return String(text || '')
    .split(/[,;\n]+/)
    .map((s) => s.trim().toLowerCase())
    .filter(Boolean);
}

function decodeText(base64) {
  const bin = atob(base64);
  const bytes = Uint8Array.from(bin, (c) => c.charCodeAt(0));
  return new TextDecoder('utf-8').decode(bytes);
}

function hexOrNull(v) {
  return HEX.test(String(v || '')) ? String(v).toUpperCase() : null;
}

/** Vérifie les arbitrages (clés propres à l'instance, absentes du questionnaire). */
function checkOverrides(ov, errors) {
  if (!isObj(ov)) return;
  for (const k of ['primary', 'accent', 'text', 'success']) {
    const v = ov.brand?.colors?.[k];
    if (v !== undefined && v !== null && !HEX.test(String(v))) errors.push(`overrides brand.colors.${k} : #RRGGBB attendu.`);
  }
  for (const k of ['font', 'titleFont']) {
    const v = ov.appearance?.[k];
    if (v !== undefined && v !== null && !FONTS[v]) errors.push(`overrides appearance.${k} : « ${v} » inconnue (${Object.keys(FONTS).join(', ')}).`);
  }
  const av = ov.assistant?.avatarFile;
  if (av !== undefined && !/^[\w.-]+\.(svg|png|jpe?g|webp)$/i.test(String(av))) {
    errors.push('overrides assistant.avatarFile : nom de fichier image attendu (svg, png, jpg, webp), dans le dossier du client.');
  }
  for (const [k, max] of [['welcome', 120], ['persona', 1500]]) {
    const v = ov.assistant?.[k];
    if (v !== undefined && (typeof v !== 'string' || v.length > max)) errors.push(`overrides assistant.${k} : texte de ${max} caractères maximum.`);
  }
  const tag = ov.assistant?.tagline;
  if (tag !== undefined && (typeof tag !== 'string' || tag.length > 80)) errors.push('overrides assistant.tagline : texte de 80 caractères maximum.');
  const refs = ov.ai?.referenceDocuments;
  if (refs !== undefined && !Array.isArray(refs)) errors.push('overrides ai.referenceDocuments : liste de noms de fichiers attendue.');
}

/**
 * Construit la configuration d'instance.
 * @param {object} answers    réponses au questionnaire v2
 * @param {object} [overrides] arbitrages validés pour ce client
 * @returns {{valid: boolean, errors: string[], warnings: string[], ui?: object, ai?: object, logos?: object[], documents?: object[]}}
 */
export function buildInstance(answers, overrides = {}) {
  const { note, ai: aiOverrides = {}, ...answerOverrides } = isObj(overrides) ? overrides : {};
  const errors = [];
  checkOverrides(overrides, errors);
  // Les arbitrages s'appliquent AVANT la validation : un fichier client
  // incomplet peut être complété par un arbitrage explicite.
  const merged = isObj(answers) ? deepMerge(answers, answerOverrides) : answers;
  const check = validateAnswers(isObj(merged) ? { ...merged, appearance: stripInstanceFonts(merged.appearance) } : merged);
  errors.push(...check.errors);
  const warnings = [...check.warnings];
  if (errors.length) return { valid: false, errors, warnings };

  const a = merged;
  const extra = a.brand.extra || {};
  const app = a.appearance;

  const logos = [];
  const logoPaths = { light: null, dark: null };
  for (const which of ['light', 'dark']) {
    const f = a.brand.logo?.[which];
    if (!f) continue;
    const { mimeType, base64 } = parseDataUrl(f.dataUrl);
    const fileName = `logo-${which}.${MIME_EXT[mimeType]}`;
    logos.push({ which, fileName, mimeType, base64 });
    logoPaths[which] = `/brand/${fileName}`;
  }

  const ui = {
    instanceVersion: INSTANCE_VERSION,
    client: {
      companyName: a.client.companyName.trim(),
      productName: a.client.productName.trim(),
      website: String(a.client.website || '').trim(),
      isFictional: a.client.isFictional === true,
      // Prénom de la titulaire de la boîte (arbitrage) : accueil « Bonjour Carine ».
      ownerFirstName: String(a.client.ownerFirstName || '').trim().slice(0, 40),
    },
    brand: {
      logo: logoPaths,
      colors: {
        // useKHentikDefaults est volontairement ignoré (jamais de couleurs KHentik chez un client).
        primary: hexOrNull(a.brand.colors?.primary) || DEFAULT_UI.brand.colors.primary,
        accent: hexOrNull(a.brand.colors?.accent) || DEFAULT_UI.brand.colors.accent,
        background: hexOrNull(extra.surface),
        link: hexOrNull(extra.links),
        text: hexOrNull(a.brand.colors?.text),
        success: hexOrNull(a.brand.colors?.success),
      },
    },
    appearance: {
      ...DEFAULT_UI.appearance,
      ...Object.fromEntries(Object.keys(DEFAULT_UI.appearance).filter((k) => app[k] !== undefined).map((k) => [k, app[k]])),
    },
    assistant: {
      name: a.assistant.name.trim(),
      tagline: String(a.assistant.tagline || DEFAULT_UI.assistant.tagline).trim(),
      // Phrase d'accueil du panneau (arbitrage) ; vide = « Bonjour, je suis <nom> ! ».
      welcome: String(a.assistant.welcome || '').trim(),
      // Avatar : fichier image du dossier client (arbitrage), copié dans public/brand/.
      avatar: a.assistant.avatarFile ? `/brand/assistant-avatar${String(a.assistant.avatarFile).slice(String(a.assistant.avatarFile).lastIndexOf('.'))}` : null,
      tone: a.assistant.tone || 'cordial',
      concision: a.assistant.concision || 'balanced',
      language: a.assistant.language || 'fr',
    },
    priorities: { importantSenders: splitList(a.context.importantSenders) },
    meta: { source: a.meta?.source || 'questionnaire-v2', exportedAt: a.meta?.exportedAt || null },
  };

  const documents = (a.documents || []).map((d) => {
    const { mimeType, base64 } = parseDataUrl(d.dataUrl);
    return { fileName: String(d.fileName || d.name || 'document').replace(/[\\/]/g, '_'), mimeType, base64 };
  });

  const wanted = Array.isArray(aiOverrides.referenceDocuments) ? aiOverrides.referenceDocuments : [];
  let budget = MAX_REFERENCE_CHARS;
  const referenceTexts = [];
  for (const name of wanted) {
    const doc = documents.find((d) => d.fileName === name);
    if (!doc) {
      errors.push(`overrides ai.referenceDocuments : « ${name} » absent des documents du questionnaire.`);
      continue;
    }
    if (doc.mimeType !== 'text/plain') {
      warnings.push(`« ${name} » n’est pas un texte brut : non transmis à l’IA.`);
      continue;
    }
    const text = decodeText(doc.base64).slice(0, Math.max(0, budget));
    budget -= text.length;
    referenceTexts.push({ fileName: name, text });
  }
  if (errors.length) return { valid: false, errors, warnings };

  const s = a.assistant;
  const c = a.context;
  const ai = {
    profileVersion: 1,
    companyName: ui.client.companyName,
    website: ui.client.website,
    assistant: {
      name: ui.assistant.name,
      // Personnalité de l'assistant dans SES réponses (pas dans les brouillons d'e-mails).
      persona: String(s.persona || '').trim(),
      tone: ui.assistant.tone,
      concision: ui.assistant.concision,
      language: ui.assistant.language,
      formality: s.formality || 'vous',
      greeting: s.greeting || 'contextual',
      signature: s.signature || 'none',
      signatureText: s.signature === 'custom' ? String(s.signatureText || '').trim() : '',
      clarify: s.clarify || 'ask',
      empathy: s.empathy || 'balanced',
      avoidPromises: s.avoidPromises !== false,
      forbiddenTerms: String(s.forbiddenTerms || '').trim(),
      exampleResponse: String(s.exampleResponse || '').trim(),
      instructions: String(s.instructions || '').trim(),
    },
    context: {
      activity: String(c.activity || '').trim(),
      businessDescription: String(c.businessDescription || '').trim(),
      audience: String(c.audience || '').trim(),
      emailTypes: (c.emailTypes || []).map((t) => ALLOWED.emailTypes[t]),
      priorityExpectations: String(c.priorityExpectations || '').trim(),
      priorityRules: String(c.priorityRules || '').trim(),
      escalationRules: String(c.escalationRules || '').trim(),
      importantSenders: ui.priorities.importantSenders,
      vocabulary: String(c.vocabulary || '').trim(),
      notes: String(c.notes || '').trim(),
      exampleEmails: String(c.exampleEmails || '').trim(),
    },
    referenceTexts,
  };

  for (const [p, neutral] of Object.entries(NOT_YET_APPLIED)) {
    const [sec, key, sub] = p.split('.');
    const v = sub ? a[sec]?.[key]?.[sub] : a[sec]?.[key];
    if (v !== undefined && v !== null && v !== '' && v !== neutral) warnings.push(`${p} = « ${v} » : lu, pas encore appliqué par l’application.`);
  }
  if (note) warnings.push(`Arbitrage appliqué : ${note}`);
  const assistantAvatar = a.assistant.avatarFile ? { source: String(a.assistant.avatarFile), fileName: ui.assistant.avatar.slice('/brand/'.length) } : null;
  return { valid: true, errors: [], warnings, ui, ai, logos, documents, assistantAvatar };
}

/** Les polices propres à l'instance ne passent pas la validation du questionnaire : on les retire avant. */
function stripInstanceFonts(appearance) {
  if (!isObj(appearance)) return appearance;
  const { titleFont, ...rest } = appearance;
  void titleFont;
  if (rest.font && !ALLOWED.font[rest.font] && FONTS[rest.font]) delete rest.font;
  return rest;
}
