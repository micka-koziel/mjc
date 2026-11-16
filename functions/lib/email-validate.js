/**
 * email-validate.js — Validation des adresses email côté serveur (Sprint 29).
 *
 * Garde-fou avant l'appel Gmail API dans sendReplyDraft : une adresse mal
 * formée renvoyait un « HTTP 500 — Invalid To header » opaque. On valide
 * désormais et on renvoie un 400 explicite.
 *
 * Équivalent ESM côté front : src/features/mailbox/lib/validate-recipients.js
 * (logique volontairement dupliquée — runtimes différents, helper trivial).
 */

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

/**
 * Extrait l'adresse d'une entrée « Nom <adresse> » ou « adresse ».
 * @param {string} entry
 * @return {string}
 */
function extractAddress(entry) {
  const s = String(entry || "").trim();
  const m = s.match(/<([^>]+)>/);
  return (m ? m[1] : s).trim();
}

/**
 * Vrai si l'entrée contient une adresse email valide.
 * @param {string} entry
 * @return {boolean}
 */
function isValidEmail(entry) {
  return EMAIL_RE.test(extractAddress(entry));
}

/**
 * Découpe une string multi-destinataires (virgule / point-virgule).
 * @param {string} input
 * @return {string[]}
 */
function splitRecipients(input) {
  if (!input) return [];
  return String(input)
    .split(/[,;]/)
    .map((s) => s.trim())
    .filter(Boolean);
}

/**
 * Sépare destinataires valides et invalides.
 * @param {string} input
 * @return {{valid: string[], invalid: string[]}}
 */
function validateRecipients(input) {
  const parts = splitRecipients(input);
  const valid = [];
  const invalid = [];
  for (const p of parts) {
    if (isValidEmail(p)) valid.push(p);
    else invalid.push(p);
  }
  return {valid, invalid};
}

module.exports = {
  extractAddress,
  isValidEmail,
  splitRecipients,
  validateRecipients,
};
