/**
 * Concatène des classes CSS conditionnelles.
 * Filtre les valeurs falsy (false, null, undefined, '') et joint le reste avec un espace.
 *
 * Utilisé pour composer dynamiquement des classes Tailwind dans les composants.
 *
 * @example
 *   cn('btn', isActive && 'btn-active', 'btn-lg')
 *   // → 'btn btn-active btn-lg' si isActive est vrai
 *   // → 'btn btn-lg' sinon
 *
 * @param {...(string|boolean|null|undefined)} classes - Les classes à concaténer
 * @returns {string} La chaîne de classes finale
 */
export function cn(...classes) {
  return classes.filter(Boolean).join(' ');
}
