/**
 * Texte brut pour l'affichage des réponses de l'assistant : sans markdown
 * (astérisques, titres) ni émojis. Même logique que
 * functions/lib/assistant-answer.js (test de parité côté fonctions).
 */
export function plainText(s) {
  return String(s ?? '')
    .replace(/```[a-z]*\n?/gi, '')
    .replace(/`([^`]*)`/g, '$1')
    .replace(/\*\*([^*]+)\*\*/g, '$1')
    .replace(/__([^_]+)__/g, '$1')
    .replace(/^\s{0,3}#{1,6}\s+/gm, '')
    .replace(/^\s*[*-]\s+/gm, '• ')
    .replace(/\*{1,3}|_{2,3}/g, '')
    .replace(/\p{Extended_Pictographic}️?/gu, '')
    .replace(/[ \t]+/g, ' ')
    .replace(/ *\n */g, '\n')
    .replace(/\n{3,}/g, '\n\n')
    .trim();
}
