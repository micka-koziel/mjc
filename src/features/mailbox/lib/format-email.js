/**
 * format-email.js — Helpers de parsing des champs From/To Gmail.
 *
 * Les headers Gmail "from" et "to" arrivent au format RFC 5322 :
 *   - "Jean Dupont <jean@example.com>"
 *   - "jean@example.com"
 *   - "<jean@example.com>"
 *   - "\"Dupont, Jean\" <jean@example.com>"  (avec quotes échappés)
 *
 * Ces helpers parsent ces formats vers {name, email} et fournissent un
 * affichage propre + des initiales pour l'avatar.
 */

/**
 * Parse un header "Name <email>" en {name, email}.
 *
 * @param {string} raw Header brut
 * @returns {{name: string, email: string}}
 */
export function parseEmailAddress(raw) {
  if (!raw || typeof raw !== 'string') {
    return { name: '', email: '' };
  }
  const trimmed = raw.trim();
  const angleMatch = trimmed.match(/^(.*?)<([^>]+)>\s*$/);
  if (angleMatch) {
    const namePart = angleMatch[1].trim().replace(/^"(.*)"$/, '$1');
    return { name: namePart, email: angleMatch[2].trim() };
  }
  // Pas de chevrons : c'est juste un email
  return { name: '', email: trimmed };
}

/**
 * Retourne le nom à afficher : préfère le name, fallback sur l'email.
 *
 * @param {string} raw Header brut
 * @returns {string}
 */
export function displayName(raw) {
  const { name, email } = parseEmailAddress(raw);
  return name || email || '';
}

/**
 * Retourne 2 initiales à afficher dans un avatar circulaire.
 * Logique :
 *  - "Jean Dupont"   → "JD"
 *  - "jean.dupont@…" → "JD"
 *  - "jean@…"        → "JE"  (2 premiers chars du local part)
 *  - "1234 5678"     → "?"   (Sprint 21 PR2 fix : fallback safe quand aucune lettre)
 *  - ""              → "?"
 *
 * Sprint 23 PR3 — fix `initialsFromAddress('jean@example.com')` qui
 * retournait `'JC'` au lieu de `'JE'`. La cause : on tokenizait sur `.`
 * y compris dans le domaine ("jean@example.com" se splittait en
 * "jean@example" puis "com" → premières lettres "j" + "c" = "JC").
 * Fix : si on n'a pas de name, on tokenize la PARTIE LOCALE de l'email
 * (avant `@`) au lieu de l'email entier.
 *
 * @param {string} raw Header brut
 * @returns {string}
 */
export function initialsFromAddress(raw) {
  const { name, email } = parseEmailAddress(raw);
  if (!name && !email) return '?';

  // Si on a un name (depuis "Name <email>"), on l'utilise.
  // Sinon, on isole la partie locale de l'email (avant `@`) pour ne pas
  // mélanger les tokens du local part et du domaine.
  const source = name || email.split('@')[0] || '';

  // Double-filter Boolean — une fois après split (segments vides) et une
  // fois après map replace (segments sans aucune lettre, type "1234").
  // Sans ce second filter, un From "1234 5678 <bot@example.com>" produit
  // ["", ""] et plante avec TypeError sur .toUpperCase de undefined.
  const words = source
    .split(/[\s.+_-]+/)
    .filter(Boolean)
    .map((w) => w.replace(/[^a-zA-ZÀ-ÿ]/g, ''))
    .filter(Boolean);

  if (words.length >= 2) {
    return (words[0][0] + words[1][0]).toUpperCase();
  }
  if (words.length === 1 && words[0].length >= 2) {
    return words[0].slice(0, 2).toUpperCase();
  }
  // Dernier fallback : 1er caractère alphabétique de source, ou "?".
  const firstAlpha = source.match(/[a-zA-ZÀ-ÿ]/);
  return firstAlpha ? firstAlpha[0].toUpperCase() : '?';
}

/**
 * Parse une liste "to" (déjà splittée en array par ingestEmail.js).
 * Retourne un display "X, Y et 2 autres" si plus de 3.
 *
 * @param {string[]} list
 * @returns {string}
 */
export function summarizeRecipients(list) {
  if (!Array.isArray(list) || list.length === 0) return '';
  const names = list.map((r) => displayName(r)).filter(Boolean);
  if (names.length <= 3) return names.join(', ');
  return `${names.slice(0, 2).join(', ')} et ${names.length - 2} autres`;
}
