/**
 * Registre des modules de l'application MJC — SOURCE UNIQUE.
 *
 * MJC se construit par modules (une pièce de la maison chacun). Chaque
 * module déclare ses écrans, dans l'ordre de la barre de navigation.
 * Pour ajouter un module : le déclarer ici, puis créer ses écrans.
 *
 * Tant qu'un seul module est actif, la navigation n'affiche pas de titre
 * de module (un menu à un seul choix encombre sans servir).
 */
export const MODULES = Object.freeze([
  Object.freeze({
    id: 'email',
    label: 'E-mail',
    enabled: true,
    nav: Object.freeze([
      { label: 'Assistant IA', view: 'home', icon: 'spark' },
      { label: 'Mailbox', view: 'mailbox', icon: 'mail' },
      { label: 'To-do', view: 'todos', icon: 'check' },
    ]),
  }),
]);

/** Modules actifs, dans l'ordre du registre. */
export function enabledModules(modules = MODULES) {
  return modules.filter((m) => m.enabled);
}

/** Les titres de modules n'apparaissent qu'à partir de deux modules actifs. */
export function showModuleTitles(modules = MODULES) {
  return enabledModules(modules).length > 1;
}
