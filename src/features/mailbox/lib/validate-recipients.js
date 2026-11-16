/**
 * validate-recipients.js — Validation des destinataires email (Sprint 29).
 *
 * Évite l'erreur opaque « HTTP 500 — Invalid To header » renvoyée par Gmail
 * quand une adresse est mal formée : on valide côté client AVANT l'appel à la
 * Cloud Function, et on affiche un message clair.
 *
 * Helpers purs (pas de dépendance React/Firebase) → testables isolément.
 * Un équivalent CJS existe côté serveur : functions/lib/email-validate.js.
 */

// Regex pragmatique (pas une RFC 5322 complète) : un nom, @, un domaine avec
// au moins un point. Couvre 99% des cas réels et rejette les fautes de frappe
// type « mickael.koziel@saint-gobain » (TLD manquant).
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

/**
 * Extrait l'adresse d'une entrée au format « Nom <adresse> » ou « adresse ».
 * @param {string} entry
 * @returns {string}
 */
export function extractAddress(entry) {
  const s = String(entry || '').trim();
  const m = s.match(/<([^>]+)>/);
  return (m ? m[1] : s).trim();
}

/**
 * Vrai si l'entrée contient une adresse email valide.
 * @param {string} entry
 * @returns {boolean}
 */
export function isValidEmail(entry) {
  return EMAIL_RE.test(extractAddress(entry));
}

/**
 * Découpe une string multi-destinataires (virgule ou point-virgule).
 * @param {string} input
 * @returns {string[]}
 */
export function splitRecipients(input) {
  if (!input) return [];
  return String(input)
    .split(/[,;]/)
    .map((s) => s.trim())
    .filter(Boolean);
}

/**
 * Sépare les destinataires valides des invalides.
 * @param {string} input
 * @returns {{ valid: string[], invalid: string[] }}
 */
export function validateRecipients(input) {
  const parts = splitRecipients(input);
  const valid = [];
  const invalid = [];
  for (const p of parts) {
    if (isValidEmail(p)) valid.push(p);
    else invalid.push(p);
  }
  return { valid, invalid };
}
