/**
 * Sprint 90 — Mise en forme HTML « simple » des emails sortants.
 *
 * Retour Max (WhatsApp 14/08) : « Typo des emails, possible de changer pour
 * plus simple ? ». Jusqu'ici tous les emails partaient en `text/plain` pur :
 * la police affichée dépendait alors entièrement du client mail du
 * destinataire, et plusieurs d'entre eux (Outlook, certains webmails) rendent
 * le texte brut en chasse fixe — d'où l'impression de « typo bizarre ».
 *
 * On fabrique donc, à partir du MÊME texte, une version HTML minimaliste qui
 * fixe une police universelle et neutre (Arial/Helvetica). Le texte brut reste
 * envoyé en parallèle (multipart/alternative, cf. buildContentSection dans
 * gmail-client.js) : aucun destinataire ne perd d'information.
 *
 * Métaphore : on n'écrit pas une autre lettre, on la recopie sur du papier à
 * en-tête neutre — même mots, police maîtrisée.
 *
 * Module PUR : aucune I/O, aucune dépendance Firebase. Testable seul.
 */

/**
 * Police par défaut des emails sortants. Volontairement une police « web
 * safe » présente sur tous les OS : aucune police Google/embarquée, qui
 * serait ignorée ou remplacée aléatoirement par les clients mail.
 */
const EMAIL_FONT_FAMILY = "Arial, Helvetica, sans-serif";
const EMAIL_FONT_SIZE = "14px";
const EMAIL_LINE_HEIGHT = "1.6";
const EMAIL_TEXT_COLOR = "#202124";

/**
 * Échappe les caractères qui auraient un sens en HTML (SEC-7). Appliqué AVANT
 * toute autre transformation : le contenu vient d'un brouillon IA ou d'une
 * saisie humaine, jamais de confiance.
 *
 * @param {string} str
 * @return {string}
 */
function escapeHtml(str) {
  return String(str === null || str === undefined ? "" : str)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

/**
 * Rend cliquables les URLs et les adresses email d'un texte DÉJÀ échappé.
 *
 * En texte brut, les clients mail linkifient tout seuls ; en HTML, non. Sans
 * cette étape, passer au HTML ferait PERDRE les liens cliquables — une
 * régression invisible à la relecture.
 *
 * La ponctuation finale collée à l'URL (« . », « , », « ) »…) est laissée
 * hors du lien : « voir https://trendl.agency. » ne doit pas produire un lien
 * qui se termine par un point.
 *
 * @param {string} escaped Texte déjà passé par escapeHtml.
 * @return {string}
 */
function autolink(escaped) {
  const withUrls = escaped.replace(
    /(https?:\/\/[^\s<]+)/g,
    (match) => {
      const trailing = match.match(/[.,;:!?)\]]+$/);
      const url = trailing ? match.slice(0, -trailing[0].length) : match;
      const tail = trailing ? trailing[0] : "";
      if (!url) return match;
      return `<a href="${url}" style="color:#1a56db;">${url}</a>${tail}`;
    },
  );
  // Adresses email : on exclut celles déjà à l'intérieur d'un href.
  return withUrls.replace(
    /(^|[\s(<>])([A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,})/g,
    (match, prefix, address) =>
      `${prefix}<a href="mailto:${address}" style="color:#1a56db;">${address}</a>`,
  );
}

/**
 * Convertit un corps d'email en texte brut vers un HTML simple et robuste.
 *
 * Choix assumés :
 * - styles INLINE uniquement (les clients mail ignorent ou suppriment les
 *   feuilles de style et les balises <style>) ;
 * - une seule police, une seule taille : aucune hiérarchie typographique, le
 *   message reste une lettre, pas une newsletter ;
 * - les lignes vides deviennent des respirations entre paragraphes.
 *
 * @param {string} text Corps de l'email en texte brut.
 * @param {object} [options]
 * @param {string} [options.fontFamily] Pour surcharger la police par défaut.
 * @return {string} Fragment HTML prêt à être envoyé en multipart/alternative.
 */
function textToSimpleHtml(text, options) {
  const opts = options || {};
  const fontFamily = opts.fontFamily || EMAIL_FONT_FAMILY;
  const raw = String(text === null || text === undefined ? "" : text);

  const paragraphs = raw
    .replace(/\r\n/g, "\n")
    .split(/\n{2,}/)
    .map((block) => block.replace(/\n+$/, ""))
    .filter((block) => block.trim() !== "");

  const style = [
    `font-family:${fontFamily}`,
    `font-size:${EMAIL_FONT_SIZE}`,
    `line-height:${EMAIL_LINE_HEIGHT}`,
    `color:${EMAIL_TEXT_COLOR}`,
  ].join(";");

  if (paragraphs.length === 0) {
    return `<div style="${style};">&nbsp;</div>`;
  }

  const body = paragraphs
    .map((block) => {
      const lines = autolink(escapeHtml(block)).split("\n");
      return `<p style="margin:0 0 12px 0;">${lines.join("<br />")}</p>`;
    })
    .join("");

  return `<div style="${style};">${body}</div>`;
}

/**
 * Enrichit un payload d'envoi Gmail avec sa version HTML.
 *
 * Point d'entrée unique utilisé par les 4 envoyeurs (réponse mailbox, relance
 * recouvrement, script à la marque, prospection événement) : DRY, et une
 * seule ligne à changer le jour où Max veut une autre police.
 *
 * Ne fait rien si un `bodyHtml` est déjà fourni (l'appelant sait mieux) ou si
 * le corps texte est vide.
 *
 * @param {object} payload Payload destiné à sendMessage/createDraft.
 * @param {object} [options]
 * @return {object} Nouveau payload (l'entrée n'est pas mutée).
 */
function withSimpleHtmlBody(payload, options) {
  const base = payload || {};
  if (base.bodyHtml) return base;
  const text = base.bodyText;
  if (!text || String(text).trim() === "") return base;
  return Object.assign({}, base, {
    bodyHtml: textToSimpleHtml(text, options),
  });
}

module.exports = {
  EMAIL_FONT_FAMILY,
  escapeHtml,
  autolink,
  textToSimpleHtml,
  withSimpleHtmlBody,
};
