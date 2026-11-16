/**
 * prompts-generic.js — consignes IA GÉNÉRIQUES du package (aucune notion
 * métier propre à Trendl : pas d'agence d'influence, de créateurs, de
 * marques, de tarifs ni de CRM).
 *
 * Remplace pour le périmètre e-mails : lib/prompts.js (analyse),
 * lib/prompts-reply.js (brouillons) et lib/prompts-alfred.js (assistant).
 * Module PUR : fonctions de construction testables sans appel IA.
 */

const TONES = {
  cordial: "chaleureux et cordial, sans familiarité",
  professional: "professionnel et soutenu",
  direct: "direct et concis, poli mais sans formules superflues",
};
const CONCISION = {
  short: "très court : 2 à 4 phrases au maximum",
  balanced: "équilibré : le nécessaire, sans détails superflus",
  detailed: "détaillé : réponds à chaque point soulevé",
};
const LANG = {fr: "français", en: "anglais"};

/**
 * Style d'écriture d'après les préférences d'assistant de la configuration
 * (contract.mjs, section `assistant`). Valeurs inconnues → défauts sûrs.
 * @param {{tone?: string, concision?: string, language?: string}} prefs
 * @return {{tone: string, length: string, language: string}}
 */
function styleFromPrefs(prefs = {}) {
  return {
    tone: TONES[prefs.tone] || TONES.cordial,
    length: CONCISION[prefs.concision] || CONCISION.balanced,
    language: LANG[prefs.language] || LANG.fr,
  };
}

const SYSTEM_ANALYZE = `Tu analyses un e-mail reçu par une petite entreprise.
Tu produis :
- category : "action" (une réponse ou une action est attendue), "info" (à lire, sans action), "newsletter" (envoi de masse, lettre d'information, promotion légitime), "spam" (hameçonnage, arnaque, publicité non sollicitée), "personal" (personnel, hors activité) ;
- senderName : le nom de la personne qui écrit (null si inconnu) ;
- senderCompany : son entreprise, SEULEMENT si elle figure dans l'e-mail (signature, texte, domaine explicite) ; sinon null ;
- summary1Line : une phrase courte (15 à 30 mots) en français qui dit qui écrit, de quelle entreprise si connue, à quel sujet, et l'action attendue s'il y en a une. Exemple de style : « Jean-Pierre, de Maison Dupont, demande de confirmer la quantité et la date de livraison de sa commande. » ;
- expectedAction : l'action attendue en quelques mots à l'infinitif (ex. « Confirmer la date de livraison »), ou null ;
- language : langue principale de l'e-mail.
N'invente jamais d'information absente de l'e-mail. Réponds uniquement via l'outil.`;

const TOOL_ANALYZE = {
  name: "analyze_email",
  description: "Analyse générique d'un e-mail entrant.",
  input_schema: {
    type: "object",
    properties: {
      category: {type: "string", enum: ["action", "info", "newsletter", "spam", "personal"]},
      senderName: {type: ["string", "null"]},
      senderCompany: {type: ["string", "null"]},
      summary1Line: {type: "string"},
      expectedAction: {type: ["string", "null"]},
      language: {type: "string", enum: ["fr", "en", "other"]},
    },
    required: ["category", "senderName", "senderCompany", "summary1Line", "expectedAction", "language"],
  },
};

function buildAnalyzeUser(m) {
  return [
    `De : ${m.from || ""}`,
    `À : ${(m.to || []).join(", ")}`,
    m.cc && m.cc.length ? `Cc : ${m.cc.join(", ")}` : "",
    `Objet : ${m.subject || ""}`,
    m.has_list_unsubscribe ? "(Contient un lien de désinscription : envoi de masse probable.)" : "",
    "",
    String(m.bodyText || m.snippet || "").slice(0, 6000),
  ].filter((l) => l !== "").join("\n");
}

const SYSTEM_THREAD = `Tu résumes une conversation d'e-mails pour la personne qui doit y répondre.
Produis :
- summary : 1 à 3 phrases : qui sont les interlocuteurs, de quoi il s'agit, ce qui s'est passé ;
- keyPoints : jusqu'à 5 points utiles (demandes, dates, quantités, engagements), dans l'ordre chronologique ;
- status : la situation actuelle en une phrase (ex. « En attente de votre réponse : confirmer la date » ou « Vous avez répondu en dernier ; en attente de leur retour »).
Utilise UNIQUEMENT les messages fournis. Si des messages semblent manquer, ne les invente pas. Réponds en français, uniquement via l'outil.`;

const TOOL_THREAD = {
  name: "summarize_thread",
  description: "Résumé d'une conversation d'e-mails.",
  input_schema: {
    type: "object",
    properties: {
      summary: {type: "string"},
      keyPoints: {type: "array", items: {type: "string"}},
      status: {type: "string"},
    },
    required: ["summary", "keyPoints", "status"],
  },
};

/**
 * Transcription d'un fil pour l'IA (messages triés, du plus ancien au plus
 * récent), avec la direction de chaque message vue de l'utilisateur.
 */
function buildThreadUser(messages, {maxChars = 2500} = {}) {
  return messages
      .map((m, i) => {
        const who = m.direction === "outbound" ? "VOUS (utilisateur)" : m.from || "?";
        const when = m.receivedAtIso || "";
        return `--- Message ${i + 1} · ${when}\nDe : ${who}\nObjet : ${m.subject || ""}\n${String(m.bodyText || m.snippet || "").slice(0, maxChars)}`;
      })
      .join("\n\n");
}

function buildReplySystem(prefs, settings = {}) {
  const st = styleFromPrefs(prefs);
  return `Tu rédiges, pour la personne qui utilise la messagerie, une proposition de réponse au DERNIER message reçu d'une conversation.
Règles :
- Ton : ${st.tone}. Longueur : ${st.length}. Langue : ${st.language}, sauf consigne contraire de l'utilisateur.
- Réponds aux demandes du dernier message en t'appuyant sur toute la conversation.
- N'invente AUCUN fait (prix, date, quantité, lien, adresse, engagement) absent de la conversation ou de la consigne. Si une information manque, écris un espace réservé entre crochets, ex. [à compléter : date de livraison] : l’envoi sera bloqué tant qu’il reste.
- Pas de signature détaillée : termine par une formule de politesse et le prénom si connu${settings.signature ? ` ; signature habituelle : « ${settings.signature} »` : ""}.
${settings.rules_avoid ? `- À éviter : ${settings.rules_avoid}\n` : ""}- La personne relira et modifiera le texte avant de l'envoyer.
Réponds uniquement via l'outil.`;
}

const TOOL_REPLY = {
  name: "draft_reply",
  description: "Brouillon de réponse à un e-mail.",
  input_schema: {
    type: "object",
    properties: {
      subject_proposed: {type: "string"},
      body: {type: "string"},
      language_detected: {type: "string", enum: ["fr", "en", "other"]},
      confidence: {type: "number", minimum: 0, maximum: 1},
    },
    required: ["subject_proposed", "body", "language_detected", "confidence"],
  },
};

function buildAssistantSystem(prefs, {name = "Assistant", today = ""} = {}) {
  const st = styleFromPrefs(prefs);
  return `Tu es ${name}, l'assistant e-mail d'une petite entreprise. Aujourd'hui : ${today}.
Ton périmètre : la boîte de réception et les tâches (To-do). Tu peux chercher des e-mails, lire une conversation et lister les tâches. Tu ne réalises AUCUNE action (pas d'envoi, pas de suppression) : tu informes et tu orientes vers les écrans de l'application.
Réponds en ${st.language}, de façon ${st.tone}, brève (quelques lignes, listes courtes si utile). Cite les expéditeurs et les objets pour que l'utilisateur retrouve les e-mails.
Si l'information n'est pas dans ce que tes outils renvoient, dis-le simplement. Hors de ce périmètre, réponds poliment que tu ne traites que les e-mails et les tâches.
Termine toujours en appelant l'outil "repondre".`;
}

module.exports = {
  styleFromPrefs,
  SYSTEM_ANALYZE,
  TOOL_ANALYZE,
  buildAnalyzeUser,
  SYSTEM_THREAD,
  TOOL_THREAD,
  buildThreadUser,
  buildReplySystem,
  TOOL_REPLY,
  buildAssistantSystem,
};
