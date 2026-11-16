/**
 * text-fold.js — repliage de texte partagé (Sprint 89, requête Max 03/08 :
 * « Rémi, si je tape Remi, je dois le trouver »).
 *
 * UNE seule définition de « insensible aux accents et à la casse » pour toute
 * l'app (FW-3 DRY) : search bars d'objets (EntityTable), combobox de
 * références (SearchableEntitySelect), browser de related lists, recherche
 * Mailbox et recherche intelligente de la home (card-search).
 *
 * Le repliage NFD sans les marques diacritiques PRÉSERVE LA LONGUEUR des
 * lettres latines accentuées courantes (é→e, à→a, ç→c…) : les positions
 * restent alignées avec le texte d'origine, ce qui permet le surlignage
 * exact de card-search. Lib PURE (aucun React, aucun Firestore).
 */

/**
 * Replie une chaîne : sans accents, en minuscules. Longueur préservée (FR).
 * @param {*} value valeur quelconque (null → '')
 * @returns {string} chaîne repliée
 */
export function fold(value) {
  if (value === null || value === undefined) return '';
  return String(value)
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase();
}

/**
 * Version « requête » : repliée + rognée (espaces de bord ignorés).
 * @param {*} value requête saisie
 * @returns {string} requête normalisée
 */
export function normalizeSearch(value) {
  return fold(value).trim();
}

/**
 * Position de la requête dans un texte replié, mais UNIQUEMENT en DÉBUT DE MOT
 * (Sprint 91, retour Max du 02/09 : « je tape Rémi, j'ai du Hugo qui sort »).
 *
 * Cause : `includes()` matche n'importe où dans la chaîne — « remi » se trouve
 * à l'intérieur de « p-remi-um ». Un début de mot = position 0, ou position
 * précédée d'un caractère qui n'est ni une lettre ni un chiffre (espace,
 * tiret, arobase, point…). « lechev » trouve toujours « Lechevalier », mais
 * « remi » ne trouve plus « premium ».
 *
 * Les deux arguments sont attendus DÉJÀ REPLIÉS (fold) — la longueur étant
 * préservée par le repliage, l'index renvoyé reste aligné sur le texte
 * d'origine, ce qui permet surlignage et extraits exacts.
 *
 * @param {string} foldedText texte replié où chercher
 * @param {string} foldedQuery requête repliée (un seul terme)
 * @param {number} [from=0] position de départ
 * @returns {number} index du début de mot, ou -1
 */
export function indexOfWordStart(foldedText, foldedQuery, from = 0) {
  if (!foldedText || !foldedQuery) return -1;
  const isWordChar = /[\p{L}\p{N}]/u;
  let i = from;
  while (i <= foldedText.length - foldedQuery.length) {
    const idx = foldedText.indexOf(foldedQuery, i);
    if (idx === -1) return -1;
    if (idx === 0 || !isWordChar.test(foldedText[idx - 1])) return idx;
    i = idx + 1;
  }
  return -1;
}

/**
 * Le texte correspond-il à la requête ? (Sprint 91 — recherche stricte.)
 *
 * Chaque terme de la requête doit apparaître en DÉBUT DE MOT quelque part
 * dans le texte. Une requête vide correspond à tout (pas de filtre).
 * « remi lechev » trouve « Rémi Lechevalier » ; « remi » ne trouve plus
 * « premium ».
 *
 * @param {*} text texte cherché (replié ici)
 * @param {*} query requête saisie par l'utilisateur
 * @returns {boolean}
 */
export function matchesQuery(text, query) {
  const q = normalizeSearch(query);
  if (!q) return true;
  const haystack = fold(text);
  return q
    .split(/\s+/)
    .filter(Boolean)
    .every((term) => indexOfWordStart(haystack, term) !== -1);
}
