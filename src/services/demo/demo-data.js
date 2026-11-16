/**
 * Jeu de démonstration FICTIF — aucune donnée réelle (ni Trendl, ni client).
 *
 * Toutes les personnes, entreprises et adresses sont inventées ; les domaines
 * utilisent l'extension réservée « .example » (RFC 2606), qui ne peut
 * appartenir à personne. Les dates sont calculées par rapport à « maintenant »
 * pour que la démo reste vivante quel que soit le jour.
 *
 * Forme des messages : celle de la collection Firestore `messages` de Trendl
 * (id, threadId, from, to, cc, subject, snippet, bodyText, labels,
 * receivedAt, direction), avec l'analyse IA générique `analysis` du package.
 */

export const DEMO_USER = Object.freeze({
  uid: 'demo-user',
  displayName: 'Camille Martin',
  email: 'camille.martin@entreprise-demo.example',
});

const ME = `${DEMO_USER.displayName} <${DEMO_USER.email}>`;
const H = 60 * 60 * 1000;
const D = 24 * H;

function msg(base, now) {
  const { ago, ...rest } = base;
  const outbound = rest.direction === 'outbound';
  return {
    to: outbound ? [] : [ME],
    cc: [],
    attachments: [],
    ...rest,
    receivedAt: now - ago,
    snippet: rest.snippet || String(rest.bodyText || '').replace(/\s+/g, ' ').slice(0, 140),
  };
}

/**
 * @param {number} now horodatage de référence (ms)
 * @returns {object[]} messages
 */
export function buildDemoMessages(now = Date.now()) {
  const list = [
    // --- Fil 1 : Maison Dupont (3 messages, action attendue) --------------
    {
      id: 'm-dupont-1',
      threadId: 't-dupont',
      from: 'Jean-Pierre Dupont <jp.dupont@maison-dupont.example>',
      subject: 'Commande de fin d’année',
      bodyText:
        'Bonjour Camille,\n\nNous souhaitons renouveler notre commande de fin d’année : 120 coffrets, livrés à notre boutique de Lyon.\nPouvez-vous nous confirmer la faisabilité ?\n\nBien cordialement,\nJean-Pierre Dupont\nMaison Dupont',
      labels: ['INBOX'],
      direction: 'inbound',
      ago: 6 * D,
      analysis: {
        status: 'completed',
        category: 'action',
        senderName: 'Jean-Pierre Dupont',
        senderCompany: 'Maison Dupont',
        summary1Line: 'Jean-Pierre, de Maison Dupont, souhaite renouveler sa commande de 120 coffrets livrés à Lyon.',
        expectedAction: 'Confirmer la faisabilité de la commande',
      },
    },
    {
      id: 'm-dupont-2',
      threadId: 't-dupont',
      from: ME,
      to: ['Jean-Pierre Dupont <jp.dupont@maison-dupont.example>'],
      subject: 'Re: Commande de fin d’année',
      bodyText:
        'Bonjour Jean-Pierre,\n\nC’est tout à fait possible. Je vous propose une livraison la semaine du 8 décembre.\n\nBien à vous,\nCamille',
      labels: ['SENT'],
      direction: 'outbound',
      ago: 5 * D,
      analysis: { status: 'completed', category: 'info', summary1Line: 'Camille confirme la faisabilité et propose une livraison la semaine du 8 décembre.' },
    },
    {
      id: 'm-dupont-3',
      threadId: 't-dupont',
      from: 'Jean-Pierre Dupont <jp.dupont@maison-dupont.example>',
      cc: ['Claire Dupont <claire@maison-dupont.example>'],
      subject: 'Re: Commande de fin d’année',
      bodyText:
        'Bonjour Camille,\n\nMerci pour votre retour. Finalement, nous aurions besoin de 150 coffrets. Pouvez-vous me confirmer la quantité et la date de livraison exacte ?\nJe mets Claire en copie, elle réceptionnera la marchandise.\n\nJean-Pierre',
      labels: ['INBOX', 'UNREAD'],
      direction: 'inbound',
      ago: 1.5 * H,
      analysis: {
        status: 'completed',
        category: 'action',
        senderName: 'Jean-Pierre Dupont',
        senderCompany: 'Maison Dupont',
        summary1Line: 'Jean-Pierre, de Maison Dupont, demande de confirmer la quantité (150 coffrets) et la date de livraison de sa commande.',
        expectedAction: 'Confirmer la quantité et la date de livraison',
      },
    },

    // --- Fil 2 : demande de devis avec pièce jointe -----------------------
    {
      id: 'm-laurent-1',
      threadId: 't-laurent',
      from: 'Sophie Laurent <s.laurent@laurent-associes.example>',
      subject: 'Demande de devis — 40 coffrets cadeaux',
      bodyText:
        'Bonjour,\n\nPour les fêtes, notre cabinet souhaite offrir 40 coffrets à ses clients. Pourriez-vous nous adresser un devis avant vendredi ? Vous trouverez en pièce jointe notre cahier des charges.\n\nSophie Laurent\nLaurent & Associés',
      labels: ['INBOX', 'UNREAD'],
      direction: 'inbound',
      ago: 3 * H,
      attachments: [{ filename: 'cahier-des-charges.pdf', size: 184320, mimeType: 'application/pdf' }],
      analysis: {
        status: 'completed',
        category: 'action',
        senderName: 'Sophie Laurent',
        senderCompany: 'Laurent & Associés',
        summary1Line: 'Sophie, de Laurent & Associés, demande un devis pour 40 coffrets cadeaux avant vendredi.',
        expectedAction: 'Envoyer un devis avant vendredi',
      },
    },

    // --- Fil 3 : réclamation ---------------------------------------------
    {
      id: 'm-bernard-1',
      threadId: 't-bernard',
      from: 'Lucie Bernard <lucie.bernard@courriel.example>',
      subject: 'Colis abîmé à la réception',
      bodyText:
        'Bonjour,\n\nJ’ai reçu ma commande n° 4821 ce matin mais le carton était écrasé et deux produits sont abîmés. Je joins des photos. Est-il possible d’obtenir un remplacement ?\n\nMerci,\nLucie Bernard',
      labels: ['INBOX'],
      direction: 'inbound',
      ago: 5 * H,
      attachments: [{ filename: 'photo-colis.jpg', size: 512000, mimeType: 'image/jpeg' }],
      analysis: {
        status: 'completed',
        category: 'action',
        senderName: 'Lucie Bernard',
        senderCompany: null,
        summary1Line: 'Lucie Bernard signale un colis abîmé (commande 4821) et demande un remplacement.',
        expectedAction: 'Proposer un remplacement',
      },
    },

    // --- Fil 4 : rendez-vous ----------------------------------------------
    {
      id: 'm-petit-1',
      threadId: 't-petit',
      from: 'Marc Petit <marc.petit@hotel-belvedere.example>',
      subject: 'Rencontre pour un partenariat',
      bodyText:
        'Bonjour Madame Martin,\n\nNous aimerions proposer vos produits à nos clients de l’hôtel. Seriez-vous disponible jeudi ou vendredi prochain pour en discuter ?\n\nMarc Petit\nHôtel Le Belvédère',
      labels: ['INBOX'],
      direction: 'inbound',
      ago: 26 * H,
      analysis: {
        status: 'completed',
        category: 'action',
        senderName: 'Marc Petit',
        senderCompany: 'Hôtel Le Belvédère',
        summary1Line: 'Marc, de l’Hôtel Le Belvédère, propose un rendez-vous jeudi ou vendredi pour un partenariat.',
        expectedAction: 'Proposer un créneau de rendez-vous',
      },
    },

    // --- Fil 5 : facture fournisseur -------------------------------------
    {
      id: 'm-fourn-1',
      threadId: 't-fourn',
      from: 'Service facturation <factures@fournitures-rivet.example>',
      subject: 'Facture F-2026-118',
      bodyText:
        'Bonjour,\n\nVeuillez trouver ci-joint la facture F-2026-118 d’un montant de 642,00 € TTC, échéance au 30 novembre.\n\nService facturation\nFournitures Rivet',
      labels: ['INBOX'],
      direction: 'inbound',
      ago: 2 * D,
      attachments: [{ filename: 'F-2026-118.pdf', size: 96000, mimeType: 'application/pdf' }],
      analysis: {
        status: 'completed',
        category: 'info',
        senderName: 'Service facturation',
        senderCompany: 'Fournitures Rivet',
        summary1Line: 'Fournitures Rivet envoie la facture F-2026-118 de 642 € TTC, à régler avant le 30 novembre.',
        expectedAction: 'Vérifier et régler la facture',
      },
    },

    // --- Fil 6 : candidature ---------------------------------------------
    {
      id: 'm-candidat-1',
      threadId: 't-candidat',
      from: 'Thomas Leroy <thomas.leroy@courriel.example>',
      subject: 'Candidature spontanée',
      bodyText:
        'Madame,\n\nJe me permets de vous adresser ma candidature pour un poste de préparateur de commandes. Mon CV est en pièce jointe.\n\nCordialement,\nThomas Leroy',
      labels: ['INBOX'],
      direction: 'inbound',
      ago: 4 * D,
      attachments: [{ filename: 'CV-Thomas-Leroy.pdf', size: 120000, mimeType: 'application/pdf' }],
      analysis: {
        status: 'completed',
        category: 'action',
        senderName: 'Thomas Leroy',
        senderCompany: null,
        summary1Line: 'Thomas Leroy envoie une candidature spontanée pour un poste de préparateur de commandes.',
        expectedAction: 'Répondre à la candidature',
      },
    },

    // --- Fil 7 : j'ai écrit en dernier (en attente du transporteur) ------
    {
      id: 'm-transport-1',
      threadId: 't-transport',
      from: 'Planning <planning@transports-rapides.example>',
      subject: 'Enlèvement du 18 novembre',
      bodyText: 'Bonjour, l’enlèvement est prévu le 18 novembre entre 9 h et 12 h. Merci de confirmer le nombre de palettes.',
      labels: ['INBOX'],
      direction: 'inbound',
      ago: 30 * H,
      analysis: {
        status: 'completed',
        category: 'action',
        senderName: 'Planning',
        senderCompany: 'Transports Rapides',
        summary1Line: 'Transports Rapides confirme l’enlèvement du 18 novembre et demande le nombre de palettes.',
        expectedAction: 'Indiquer le nombre de palettes',
      },
    },
    {
      id: 'm-transport-2',
      threadId: 't-transport',
      from: ME,
      to: ['Planning <planning@transports-rapides.example>'],
      subject: 'Re: Enlèvement du 18 novembre',
      bodyText: 'Bonjour, ce sera 3 palettes. Merci de me confirmer l’horaire exact.\nCamille',
      labels: ['SENT'],
      direction: 'outbound',
      ago: 20 * H,
      analysis: { status: 'completed', category: 'info', summary1Line: 'Camille annonce 3 palettes et demande l’horaire exact.' },
    },

    // --- Newsletter (information) ----------------------------------------
    {
      id: 'm-news-1',
      threadId: 't-news',
      from: 'La Lettre du Commerce <lettre@lettre-commerce.example>',
      subject: 'Les 5 tendances du commerce de proximité',
      bodyText: 'Cette semaine : tendances, chiffres clés et agenda des salons. Pour vous désinscrire, cliquez ici.',
      labels: ['INBOX'],
      direction: 'inbound',
      ago: 8 * H,
      analysis: {
        status: 'completed',
        category: 'newsletter',
        senderName: 'La Lettre du Commerce',
        senderCompany: 'La Lettre du Commerce',
        summary1Line: 'Newsletter hebdomadaire sur les tendances du commerce de proximité.',
        expectedAction: null,
      },
    },

    // --- Spams -------------------------------------------------------------
    {
      id: 'm-spam-1',
      threadId: 't-spam-1',
      from: 'Service Gagnant <noreply@gains-faciles.example>',
      subject: 'Félicitations, vous avez gagné un smartphone !',
      bodyText: 'Cliquez vite pour réclamer votre cadeau. Offre limitée.',
      labels: ['SPAM'],
      direction: 'inbound',
      ago: 4 * H,
      analysis: { status: 'completed', category: 'spam', summary1Line: 'Message promotionnel suspect annonçant un gain.', expectedAction: null },
    },
    {
      id: 'm-spam-2',
      threadId: 't-spam-2',
      from: 'Sécurité Compte <alerte@verif-compte.example>',
      subject: 'Votre compte sera suspendu sous 24 h',
      bodyText: 'Confirmez vos identifiants pour éviter la suspension de votre compte.',
      labels: ['SPAM'],
      direction: 'inbound',
      ago: 10 * H,
      analysis: { status: 'completed', category: 'spam', summary1Line: 'Tentative d’hameçonnage demandant vos identifiants.', expectedAction: null },
    },
    {
      id: 'm-spam-3',
      threadId: 't-spam-3',
      from: 'Crypto Boost <promo@crypto-boost.example>',
      subject: 'Doublez votre épargne en 7 jours',
      bodyText: 'Investissez maintenant et doublez votre mise.',
      labels: ['SPAM'],
      direction: 'inbound',
      ago: 2 * D,
      analysis: { status: 'completed', category: 'spam', summary1Line: 'Publicité non sollicitée pour un placement risqué.', expectedAction: null },
    },

    // --- Archive et corbeille ---------------------------------------------
    {
      id: 'm-archive-1',
      threadId: 't-archive',
      from: 'Comptoir Vert <contact@comptoir-vert.example>',
      subject: 'Confirmation de rendez-vous',
      bodyText: 'Bonjour, notre rendez-vous du 3 novembre est bien confirmé. À bientôt.',
      labels: [],
      direction: 'inbound',
      ago: 14 * D,
      analysis: { status: 'completed', category: 'info', senderCompany: 'Comptoir Vert', summary1Line: 'Comptoir Vert confirme le rendez-vous du 3 novembre.', expectedAction: null },
    },
    {
      id: 'm-trash-1',
      threadId: 't-trash',
      from: 'Boutique Express <promo@boutique-express.example>',
      subject: '-50 % sur toute la boutique',
      bodyText: 'Profitez de nos soldes exceptionnelles.',
      labels: ['TRASH'],
      direction: 'inbound',
      ago: 3 * D,
      analysis: { status: 'completed', category: 'newsletter', summary1Line: 'Publicité de soldes.', expectedAction: null },
    },
  ];
  return list.map((m) => msg(m, now));
}

/** Tâches de démonstration (même modèle que la collection `todos` de Trendl). */
export function buildDemoTodos(now = Date.now()) {
  const iso = (ms) => new Date(ms).toISOString().slice(0, 10);
  const monday = new Date(now);
  monday.setUTCDate(monday.getUTCDate() - ((monday.getUTCDay() + 6) % 7));
  return [
    {
      id: 'todo-devis',
      text: 'Préparer le devis Laurent & Associés',
      details: 'Reprendre le cahier des charges joint au mail.',
      todo_kind: 'Ponctuel',
      due_date: iso(now),
      done: false,
      source_thread_id: 't-laurent',
      source_message_id: 'm-laurent-1',
      source_subject: 'Demande de devis — 40 coffrets cadeaux',
      created_at: now - 2 * H,
    },
    {
      id: 'todo-colis',
      text: 'Préparer les colis de la semaine',
      details: '',
      todo_kind: 'Récurrent',
      recurrence: 'Hebdomadaire',
      anchor_date: iso(monday.getTime() - 7 * D),
      last_done_occurrence: null,
      created_at: now - 20 * D,
    },
    {
      id: 'todo-tva',
      text: 'Déclaration de TVA',
      details: 'Sur l’espace professionnel des impôts.',
      link_url: 'https://www.impots.gouv.fr',
      todo_kind: 'Récurrent',
      recurrence: 'Mensuel',
      anchor_date: iso(now - 40 * D),
      last_done_occurrence: null,
      created_at: now - 60 * D,
    },
    {
      id: 'todo-stock',
      text: 'Faire l’inventaire du stock',
      details: '',
      todo_kind: 'Ponctuel',
      due_date: iso(now + 5 * D),
      done: false,
      created_at: now - 1 * D,
    },
    {
      id: 'todo-vitrine',
      text: 'Changer la vitrine',
      todo_kind: 'Ponctuel',
      due_date: iso(now - 3 * D),
      done: true,
      created_at: now - 10 * D,
    },
  ];
}
