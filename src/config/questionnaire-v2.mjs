/**
 * Questionnaire client KHentik Email, VERSION 2 — SOURCE UNIQUE des règles
 * de lecture d'un fichier de réponses.
 *
 * Le questionnaire lui-même (questionnaire/questionnaire-v2.html) est un
 * fichier autonome fourni par l'équipe KHentik : il exporte un classeur
 * Excel dont l'onglet « Donnees JSON » contient les réponses complètes.
 * Les valeurs autorisées ci-dessous sont recopiées de ce fichier : à mettre
 * à jour ici si le questionnaire évolue.
 *
 * Module PUR : aucune I/O, aucune dépendance.
 */

export const SCHEMA_VERSION = '1.0';
export const QUESTIONNAIRE_VERSION = '2.0';

/** Valeurs autorisées (clé technique → libellé du questionnaire). */
export const ALLOWED = Object.freeze({
  mode: { quick: 'Parcours rapide', detailed: 'Parcours approfondi' },
  brandStyle: { balanced: 'Équilibré', minimal: 'Minimal', expressive: 'Affirmé' },
  theme: { light: 'Clair', dark: 'Sombre', system: 'Automatique' },
  density: { comfortable: 'Aéré', compact: 'Compact' },
  textSize: { normal: 'Standard', large: 'Grande' },
  font: { system: 'Moderne', humanist: 'Douce', serif: 'Classique' },
  layout: { balanced: 'Équilibrée', list: 'Liste dominante', focus: 'Concentration' },
  messagePreview: { one: 'Une ligne', two: 'Deux lignes', none: 'Masqué' },
  sidebar: { expanded: 'Ouverte', collapsed: 'Réduite' },
  corners: { soft: 'Arrondis', square: 'Discrets' },
  contrast: { standard: 'Standard', high: 'Renforcé' },
  tone: { cordial: 'Cordial', professional: 'Professionnel', direct: 'Direct' },
  concision: { short: 'Courte', balanced: 'Équilibrée', detailed: 'Détaillée' },
  language: { fr: 'Français', en: 'Anglais' },
  formality: { vous: 'Vouvoiement', tu: 'Tutoiement', adapt: 'Selon le correspondant' },
  greeting: { contextual: 'Selon le contexte', formal: 'Toujours formelle', brief: 'Courte' },
  signature: { none: 'Aucune', company: 'Entreprise', custom: 'Personnalisée' },
  responseApproach: { draft: 'Brouillon à valider' },
  clarify: { ask: 'Demander une précision', draft: 'Formulation prudente' },
  empathy: { neutral: 'Factuelle', balanced: 'Équilibrée', warm: 'Chaleureuse' },
  emailTypes: {
    customers: 'Demandes clients',
    orders: 'Commandes / livraisons',
    suppliers: 'Fournisseurs',
    quotes: 'Devis',
    billing: 'Facturation',
    partners: 'Partenaires',
    recruiting: 'Candidatures',
    admin: 'Administratif',
    newsletters: 'Newsletters',
    other: 'Autre',
  },
});

/** Fichiers joints, mêmes limites que le questionnaire. */
export const FILE_RULES = Object.freeze({
  logoMimeTypes: ['image/png', 'image/jpeg', 'image/webp', 'image/svg+xml'],
  documentMimeTypes: [
    'application/pdf',
    'image/png',
    'image/jpeg',
    'image/webp',
    'application/msword',
    'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
    'text/plain',
  ],
  maxFileBytes: 2 * 1024 * 1024,
  maxDocuments: 12,
});

/** Champs texte libres et longueur maximale (celle du questionnaire). */
const TEXTS = Object.freeze({
  'client.companyName': 200,
  'client.productName': 200,
  'brand.extra.brandWords': 200,
  'assistant.name': 200,
  'assistant.signatureText': 1000,
  'assistant.forbiddenTerms': 2000,
  'assistant.exampleResponse': 2000,
  'assistant.instructions': 2000,
  'context.activity': 2000,
  'context.priorityExpectations': 2000,
  'context.importantSenders': 2000,
  'context.notes': 2000,
  'context.businessDescription': 2000,
  'context.audience': 2000,
  'context.vocabulary': 2000,
  'context.priorityRules': 2000,
  'context.escalationRules': 2000,
  'context.exampleEmails': 2000,
});

/** Choix fermés : chemin → clé de ALLOWED. */
const ENUMS = Object.freeze({
  mode: 'mode',
  'brand.extra.style': 'brandStyle',
  'appearance.theme': 'theme',
  'appearance.density': 'density',
  'appearance.textSize': 'textSize',
  'appearance.font': 'font',
  'appearance.layout': 'layout',
  'appearance.messagePreview': 'messagePreview',
  'appearance.sidebar': 'sidebar',
  'appearance.corners': 'corners',
  'appearance.contrast': 'contrast',
  'assistant.tone': 'tone',
  'assistant.concision': 'concision',
  'assistant.language': 'language',
  'assistant.formality': 'formality',
  'assistant.greeting': 'greeting',
  'assistant.signature': 'signature',
  'assistant.responseApproach': 'responseApproach',
  'assistant.clarify': 'clarify',
  'assistant.empathy': 'empathy',
});

const COLORS = ['brand.colors.primary', 'brand.colors.accent', 'brand.extra.secondary', 'brand.extra.surface', 'brand.extra.links'];

export const HEX = /^#[0-9a-fA-F]{6}$/;
const DATA_URL = /^data:([a-z0-9.+/-]+);base64,([A-Za-z0-9+/=]+)$/i;

export function isObj(v) {
  return v !== null && typeof v === 'object' && !Array.isArray(v);
}

/** Lit une valeur par chemin pointé (« a.b.c »). */
export function getPath(obj, path) {
  return path.split('.').reduce((o, k) => (isObj(o) ? o[k] : undefined), obj);
}

/** Taille réelle (octets) d'un contenu base64. */
export function base64Bytes(b64) {
  const s = String(b64 || '');
  const pad = s.endsWith('==') ? 2 : s.endsWith('=') ? 1 : 0;
  return Math.floor((s.length * 3) / 4) - pad;
}

/** Découpe une data URL : { mimeType, base64 } ou null. */
export function parseDataUrl(dataUrl) {
  const m = DATA_URL.exec(String(dataUrl || ''));
  return m ? { mimeType: m[1].toLowerCase(), base64: m[2] } : null;
}

function checkFile(file, path, allowedMimes, errors) {
  if (!isObj(file)) {
    errors.push(`${path} : fichier attendu.`);
    return;
  }
  const parsed = parseDataUrl(file.dataUrl);
  if (!parsed) {
    errors.push(`${path} : contenu du fichier absent ou illisible.`);
    return;
  }
  if (!allowedMimes.includes(parsed.mimeType)) errors.push(`${path} : format « ${parsed.mimeType} » non accepté.`);
  if (base64Bytes(parsed.base64) > FILE_RULES.maxFileBytes) errors.push(`${path} : plus de 2 Mo.`);
}

/**
 * Valide un fichier de réponses au questionnaire v2.
 * @param {unknown} answers  contenu de l'onglet « Donnees JSON »
 * @returns {{valid: boolean, errors: string[], warnings: string[]}}
 */
export function validateAnswers(answers) {
  const errors = [];
  const warnings = [];
  if (!isObj(answers)) return { valid: false, errors: ['Réponses : objet JSON attendu.'], warnings };

  if (answers.questionnaireVersion !== QUESTIONNAIRE_VERSION) {
    errors.push(
      `questionnaireVersion : « ${answers.questionnaireVersion ?? 'absente'} » reçue, « ${QUESTIONNAIRE_VERSION} » attendue. ` +
        'Seul le questionnaire version 2 est accepté.'
    );
  }
  for (const section of ['client', 'brand', 'appearance', 'assistant', 'context']) {
    if (!isObj(answers[section])) errors.push(`${section} : section obligatoire.`);
  }
  if (errors.length) return { valid: false, errors, warnings };

  for (const p of ['client.companyName', 'client.productName', 'assistant.name']) {
    if (!String(getPath(answers, p) ?? '').trim()) errors.push(`${p} : obligatoire.`);
  }
  for (const [p, max] of Object.entries(TEXTS)) {
    const v = getPath(answers, p);
    if (v !== undefined && v !== null && typeof v !== 'string') errors.push(`${p} : texte attendu.`);
    else if (typeof v === 'string' && v.length > max) errors.push(`${p} : ${max} caractères maximum.`);
  }
  const site = String(answers.client.website || '').trim();
  if (site && !/^https?:\/\/[^\s.]+\.[^\s]+$/i.test(site)) errors.push('client.website : adresse web invalide (https://…).');

  for (const [p, key] of Object.entries(ENUMS)) {
    const v = getPath(answers, p);
    if (v === undefined || v === null) continue;
    if (!Object.prototype.hasOwnProperty.call(ALLOWED[key], v)) {
      errors.push(`${p} : « ${v} » non autorisé (${Object.keys(ALLOWED[key]).join(', ')}).`);
    }
  }
  for (const p of COLORS) {
    const v = getPath(answers, p);
    if (v !== undefined && v !== null && !HEX.test(String(v))) errors.push(`${p} : code couleur #RRGGBB attendu.`);
  }
  if (answers.brand.colors?.useKHentikDefaults === true) {
    warnings.push(
      'brand.colors.useKHentikDefaults est coché : ignoré. Les couleurs KHentik ne s’appliquent jamais à une instance client.'
    );
  }

  const types = answers.context.emailTypes;
  if (types !== undefined && !Array.isArray(types)) errors.push('context.emailTypes : liste attendue.');
  else for (const t of types || []) if (!ALLOWED.emailTypes[t]) errors.push(`context.emailTypes : « ${t} » non autorisé.`);

  const logo = answers.brand.logo || {};
  for (const which of ['light', 'dark']) {
    if (logo[which]) checkFile(logo[which], `brand.logo.${which}`, FILE_RULES.logoMimeTypes, errors);
  }
  const docs = answers.documents ?? [];
  if (!Array.isArray(docs)) errors.push('documents : liste attendue.');
  else {
    if (docs.length > FILE_RULES.maxDocuments) errors.push(`documents : ${FILE_RULES.maxDocuments} au maximum.`);
    docs.forEach((d, i) => checkFile(d, `documents[${i}]`, FILE_RULES.documentMimeTypes, errors));
  }

  // Aucun secret ne doit transiter par le questionnaire (contenu des fichiers exclu).
  const withoutFiles = JSON.stringify({ ...answers, documents: [], brand: { ...answers.brand, logo: {} } }).toLowerCase();
  for (const forbidden of ['"password"', '"apikey"', '"api_key"', '"secret"', '"token"']) {
    if (withoutFiles.includes(forbidden)) errors.push(`Champ interdit détecté (${forbidden}) : aucun secret dans les réponses.`);
  }
  return { valid: errors.length === 0, errors, warnings };
}
