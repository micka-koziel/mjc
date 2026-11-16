/**
 * resolve-reply-to.js — Adresse de réponse, résolue CÔTÉ NAVIGATEUR (Sprint 29).
 *
 * Jumeau ESM de functions/lib/contact-reply.js. On résout l'adresse au moment
 * d'ouvrir le brouillon de réponse, à partir du document message déjà chargé
 * (subject + bodyText). Avantage : marche sur TOUS les mails (anciens comme
 * nouveaux) sans dépendre du recalcul backend à l'ingestion.
 *
 * Règle : si le mail vient d'un formulaire de contact (marqueur configurable
 * dans le sujet, par défaut « [Contact] »), on répond à l'adresse SAISIE dans le formulaire (extraite
 * du corps), pas à l'expéditeur technique Resend.
 */

// KHentik — marqueur générique (Trendl : « [Trendl Contact] »).
export const CONTACT_SUBJECT_MARKER = '[Contact]';
const EMAIL_IN_TEXT = /[^\s<>"]+@[^\s<>"]+\.[^\s<>"]+/;

export function isContactFormMessage(message) {
  return ((message && message.subject) || '').includes(CONTACT_SUBJECT_MARKER);
}

export function extractContactFormEmail(message) {
  const text = (message && message.bodyText) || '';
  const labeled = text.match(/Email\s*:\s*([^\s<>"]+@[^\s<>"]+)/i);
  if (labeled) return cleanEmail(labeled[1]);

  const generic = text.match(EMAIL_IN_TEXT);
  if (generic) return cleanEmail(generic[0]);

  const html = (message && message.bodyHtml) || '';
  const fromHtml = html.replace(/<[^>]+>/g, ' ').match(EMAIL_IN_TEXT);
  return fromHtml ? cleanEmail(fromHtml[0]) : '';
}

/**
 * Adresse de réponse à pré-remplir pour un message.
 * @param {object} message Doc /messages/{id}
 * @returns {string}
 */
export function resolveReplyTo(message) {
  if (isContactFormMessage(message)) {
    const formEmail = extractContactFormEmail(message);
    if (formEmail) return formEmail;
  }
  return (
    ((message && message.reply_to) || '').trim() ||
    (message && message.from) ||
    ''
  );
}

function cleanEmail(raw) {
  return String(raw || '')
    .trim()
    .replace(/[.,;)>\]]+$/, '');
}

// ─── Sprint 98 (#9) — copie d'une réponse (« répondre à tous ») ─────────────

// KHentik — le domaine « interne » n'est plus figé (Trendl : trendl.agency) :
// on exclut le domaine des adresses de la personne connectée.
const EMAIL_RE_G = /[a-z0-9._%+'-]+@[a-z0-9.-]+\.[a-z]{2,}/gi;

function addressesOf(value) {
  const raw = Array.isArray(value) ? value.join(', ') : String(value || '');
  return (raw.match(EMAIL_RE_G) || []).map((a) => a.toLowerCase());
}

/**
 * Personnes à mettre en copie d'une réponse : celles en À et en Cc du mail,
 * sauf le destinataire principal, l'expéditeur d'un mail entrant, les
 * adresses de la personne connectée et les autres adresses de son domaine.
 * Jumeau navigateur de functions/lib/reply-cc.js (repli quand le brouillon
 * pré-généré n'a pas encore de `cc_suggested`). PUR.
 * @param {object} message mail auquel on répond
 * @param {string} recipient destinataire principal
 * @param {string[]} [ownEmails] adresses de la personne connectée
 * @returns {string}
 */
export function suggestReplyCc(message, recipient, ownEmails = []) {
  if (!message) return '';
  const inbound = Array.isArray(message.labels) ? !message.labels.includes('SENT') || message.labels.includes('INBOX') : true;
  const exclude = new Set([
    ...addressesOf(recipient),
    ...ownEmails.flatMap((e) => addressesOf(e)),
    ...(inbound ? addressesOf(message.from) : []),
  ]);
  const internalDomains = ownEmails
    .flatMap((e) => addressesOf(e))
    .map((a) => a.split('@')[1])
    .filter(Boolean);
  const out = [];
  for (const a of [...addressesOf(message.to), ...addressesOf(message.cc)]) {
    const domain = a.split('@')[1] || '';
    if (exclude.has(a) || internalDomains.includes(domain) || out.includes(a)) continue;
    out.push(a);
  }
  return out.slice(0, 10).join(', ');
}
