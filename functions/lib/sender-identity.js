/**
 * sender-identity.js — adresse d'envoi selon la personne qui traite
 * (Sprint 95, demande de Mickaël du 11/10).
 *
 * Trendl envoie depuis UNE boîte Gmail (le compte exploitant). Une personne
 * peut avoir son adresse d'envoi (users/{uid}.sender_email) : c'est un alias
 * « Envoyer en tant que » de cette boîte. On ne l'utilise que si Gmail le
 * déclare vérifié ; sinon on garde l'adresse principale (Gmail l'imposerait
 * de toute façon). Le nom affiché est users/{uid}.sender_name.
 */

const {db} = require("./firebase-admin");
const {encodeSubject} = require("./gmail-client");

const EMAIL_RE = /^[^\s@<>"]+@[^\s@<>"]+\.[^\s@<>"]+$/;

/**
 * En-tête From : `Nom <adresse>` (nom encodé RFC 2047 si accents).
 * @param {string} name
 * @param {string} email
 * @return {string}
 */
function formatFrom(name, email) {
  const n = String(name || "").replace(/["\r\n<>]/g, "").trim();
  if (!n) return email;
  return `${encodeSubject(n)} <${email}>`;
}

/**
 * Choix pur de l'expéditeur.
 * @param {object} args
 * @param {string} args.primary Adresse de la boîte de messagerie
 * @param {object} [args.user] users/{uid}
 * @param {Array<object>|null} [args.sendAs] Liste Gmail sendAs (null = inconnue)
 * @return {{from: string, email: string, alias: boolean}}
 */
function pickSender({primary, user = {}, sendAs = null}) {
  const name = String(user.sender_name || "").trim();
  const wanted = String(user.sender_email || "").trim().toLowerCase();
  if (wanted && EMAIL_RE.test(wanted) && wanted !== String(primary || "").toLowerCase()) {
    const entry = Array.isArray(sendAs) ?
      sendAs.find((s) => String(s.sendAsEmail || "").toLowerCase() === wanted) :
      null;
    const usable = entry && (entry.isPrimary || entry.verificationStatus === "accepted");
    if (usable) {
      return {from: formatFrom(name || entry.displayName, wanted), email: wanted, alias: true};
    }
    // Sprint 103 (post 2) — l'adresse demandée n'est pas autorisée dans
    // Gmail : on le SIGNALE au lieu de partir en silence depuis la boîte de
    // Max. Les envois manuels (réponses, relances) refusent l'envoi avec
    // un message clair ; les envois automatiques gardent la boîte principale.
    if (Array.isArray(sendAs)) {
      return {
        from: name ? formatFrom(name, primary) : primary,
        email: primary,
        alias: false,
        blocked: "alias_not_enabled",
        wanted,
      };
    }
  }
  return {from: name ? formatFrom(name, primary) : primary, email: primary, alias: false};
}

/**
 * Expéditeur pour la personne `uid`. Ne lève jamais : au pire l'adresse
 * principale.
 * @param {object} gmail Client googleapis
 * @param {string|null} uid
 * @param {string} primary
 * @param {object} [logger]
 * @return {Promise<{from: string, email: string, alias: boolean}>}
 */
async function resolveSender(gmail, uid, primary, logger) {
  if (!uid) return {from: primary, email: primary, alias: false};
  let user = {};
  try {
    const snap = await db.collection("users").doc(uid).get();
    user = snap.exists ? snap.data() || {} : {};
  } catch (err) {
    logger?.warn?.("resolveSender: lecture profil impossible", {error: err.message});
  }
  let sendAs = null;
  if (user.sender_email) {
    try {
      const res = await gmail.users.settings.sendAs.list({userId: "me"});
      sendAs = res?.data?.sendAs || [];
    } catch (err) {
      logger?.warn?.("resolveSender: liste des alias indisponible", {error: err.message});
    }
  }
  const picked = pickSender({primary, user, sendAs});
  if (user.sender_email && !picked.alias) {
    logger?.warn?.("resolveSender: alias non activé dans Gmail, envoi depuis la boîte principale", {uid});
  }
  // Sprint 103 (post 2) — signature de la personne, posée à l'envoi.
  return {
    ...picked,
    signature: String(user.sender_signature || "").trim(),
    name: String(user.sender_name || "").trim(),
  };
}

/**
 * Message lisible quand l'adresse d'envoi de la personne n'est pas activée.
 * @param {{blocked?: string, wanted?: string}} sender
 * @return {string} "" si l'envoi peut partir
 */
function senderBlockMessage(sender) {
  if (!sender || !sender.blocked) return "";
  return `Votre adresse d'envoi ${sender.wanted || ""} n'est pas encore autorisée dans Gmail ` +
    "(réglage « Envoyer en tant que » de la boîte de messagerie). Le message n'est pas parti. " +
    "Demandez son activation, ou videz le champ « Adresse d'envoi » dans Mon compte " +
    "pour envoyer depuis la boîte de messagerie.";
}

module.exports = {formatFrom, pickSender, resolveSender, senderBlockMessage};
