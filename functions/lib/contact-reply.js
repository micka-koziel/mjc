/**
 * contact-reply.js — Résolution de l'adresse de réponse (Sprint 29).
 *
 * Problème : les mails issus du formulaire de contact sont relayés par
 * Resend. L'expéditeur technique est `onboarding@resend.dev` (ou l'adresse
 * CONTACT_EMAIL_FROM), PAS l'adresse du visiteur. Répondre à l'expéditeur
 * envoie donc à Resend, pas à la personne.
 *
 * Logique demandée : si on identifie un mail de formulaire de contact, on répond
 * à l'adresse SAISIE PAR LA PERSONNE dans le formulaire (présente dans le
 * corps du mail), pas à l'adresse d'envoi.
 *
 * Marqueurs fiables du template (cf src/lib/contact/email-templates.js) :
 *   - sujet : commence par « [Contact] » (paramètre CONTACT_SUBJECT_MARKER)
 *   - corps texte : ligne « Email  : <adresse> »
 *
 * Helpers PURS (pas de réseau / Firebase) → testables. Appelés à l'ingestion
 * (ingestEmail) pour calculer `reply_to` une fois pour toutes.
 */

const CONTACT_SUBJECT_MARKER = process.env.CONTACT_SUBJECT_MARKER || "[Contact]";
const EMAIL_IN_TEXT = /[^\s<>"]+@[^\s<>"]+\.[^\s<>"]+/;

/**
 * Vrai si le message provient du formulaire de contact.
 * @param {{subject?: string}} message
 * @return {boolean}
 */
function isContactFormMessage(message) {
  const subject = (message && message.subject) || "";
  return subject.includes(CONTACT_SUBJECT_MARKER);
}

/**
 * Extrait l'adresse saisie dans le formulaire depuis le corps du mail.
 * Priorité à la ligne labellisée « Email : xxx » ; sinon premier email trouvé.
 * @param {{bodyText?: string, bodyHtml?: string}} message
 * @return {string} adresse ou "" si introuvable
 */
function extractContactFormEmail(message) {
  const text = (message && message.bodyText) || "";
  const labeled = text.match(/Email\s*:\s*([^\s<>"]+@[^\s<>"]+)/i);
  if (labeled) return cleanEmail(labeled[1]);

  const generic = text.match(EMAIL_IN_TEXT);
  if (generic) return cleanEmail(generic[0]);

  // Dernier recours : corps HTML (on déshabille les balises grossièrement).
  const html = (message && message.bodyHtml) || "";
  const fromHtml = html.replace(/<[^>]+>/g, " ").match(EMAIL_IN_TEXT);
  return fromHtml ? cleanEmail(fromHtml[0]) : "";
}

/**
 * Détermine la meilleure adresse de réponse pour un message.
 *
 * @param {object} message Doc message (subject, bodyText, bodyHtml, from)
 * @param {string} [replyToHeader] Valeur du header Reply-To si présente
 * @return {string}
 */
function resolveReplyTo(message, replyToHeader) {
  if (isContactFormMessage(message)) {
    const formEmail = extractContactFormEmail(message);
    if (formEmail) return formEmail;
  }
  return (
    (replyToHeader || "").trim() ||
    (message && message.reply_to) ||
    (message && message.from) ||
    ""
  );
}

function cleanEmail(raw) {
  return String(raw || "")
    .trim()
    .replace(/[.,;)>\]]+$/, "");
}

module.exports = {
  CONTACT_SUBJECT_MARKER,
  isContactFormMessage,
  extractContactFormEmail,
  resolveReplyTo,
};
