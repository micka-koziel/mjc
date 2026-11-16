/**
 * Schéma de l'objet « To-do » (collection Firestore `todos`) — Sprint 81.
 *
 * Réunion cutover 20/07 (demande d'Aurel, validée par Mickaël) : les tâches
 * administratives récurrentes qui ne sont PAS liées aux opportunités du CRM
 * (ex: déclaration de douane mensuelle) doivent apparaître sur la home,
 * « sinon on l'a dans un coin de notre tête, mais souvent on l'a pas ».
 *
 * Deux modes :
 *  - Ponctuel  : une date d'échéance ; la carte apparaît sur la home à
 *    l'échéance et y reste tant que ce n'est pas fait.
 *  - Récurrent : une périodicité + une première échéance ; la carte
 *    réapparaît automatiquement à chaque occurrence (ex: le 1ᵉʳ du mois),
 *    et « fait » ne solde QUE l'occurrence courante.
 *
 * NB : la collection `todos` héberge aussi les tâches « à la volée » du
 * drawer To-do perso (Sprint 50 : {text, due_date, done}). Les deux
 * cohabitent : seules les fiches AVEC `todo_kind` sont des to-do
 * configurées (board home + fiche CRM) ; les autres restent dans le drawer.
 */

export const TODO_KINDS = ['', 'Ponctuel', 'Récurrent'];

export const TODO_RECURRENCES = [
  '',
  // Sprint 95 (11/10) — « tous les jours » (ex. point quotidien avec Alfred).
  'Quotidien',
  'Hebdomadaire',
  'Mensuel',
  'Trimestriel',
  'Annuel',
];

export const TODO_SECTIONS = [
  {
    id: 'task',
    label: 'Tâche',
    defaultOpen: true,
    fields: [
      {
        name: 'text',
        label: 'Tâche',
        type: 'text',
        required: true,
        placeholder: 'Ex: Déclaration de douane',
      },
      {
        name: 'details',
        label: 'Détail / mode opératoire',
        type: 'textarea',
        placeholder: 'Ex: Déclarer les imports du mois sur le portail douane.',
      },
      {
        name: 'link_url',
        label: 'Lien utile (ouvert depuis la carte)',
        type: 'url',
        placeholder: 'https://…',
      },
    ],
  },
  {
    id: 'schedule',
    label: 'Planification',
    defaultOpen: true,
    fields: [
      {
        name: 'todo_kind',
        label: 'Type',
        type: 'select',
        options: TODO_KINDS,
        defaultValue: 'Ponctuel',
      },
      {
        name: 'due_date',
        label: 'Échéance (si ponctuel)',
        type: 'date',
      },
      {
        name: 'recurrence',
        label: 'Périodicité (si récurrent)',
        type: 'select',
        options: TODO_RECURRENCES,
      },
      {
        name: 'anchor_date',
        label: 'Première échéance (si récurrent)',
        type: 'date',
      },
    ],
  },
  {
    id: 'tracking',
    label: 'Suivi',
    defaultOpen: false,
    fields: [
      {
        name: 'done',
        label: 'Fait (ponctuel uniquement)',
        type: 'checkbox',
      },
      {
        name: 'last_done_occurrence',
        label: 'Dernière occurrence soldée le (récurrent)',
        type: 'date',
      },
    ],
  },
];
