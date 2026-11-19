/**
 * Gestion des accès à l'instance — règles PURES (testables).
 *
 * Les personnes autorisées sont dans app_settings/access.allowed_emails (lu
 * par les règles Firestore et par admin-auth.js). Seuls les ADMINISTRATEURS
 * de l'instance (paramètre ADMIN_EMAILS de functions/.env) peuvent ajouter
 * ou retirer quelqu'un : un invité ne peut pas inviter (anti-escalade).
 */

const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

function normalizeEmail(value) {
  return String(value || "").trim().toLowerCase();
}

function adminEmails(env = process.env) {
  return String(env.ADMIN_EMAILS || "").split(",").map(normalizeEmail).filter(Boolean);
}

function isAdmin(email, env = process.env) {
  return adminEmails(env).includes(normalizeEmail(email));
}

/**
 * Vérifie une demande d'ajout ou de retrait.
 * @return {{ok: true, email: string, displayName: string} | {ok: false, error: string}}
 */
function checkAccessRequest({action, email, displayName, requester}, env = process.env) {
  const target = normalizeEmail(email);
  if (!EMAIL.test(target)) return {ok: false, error: "Adresse e-mail invalide."};
  const name = String(displayName || "").trim().slice(0, 60);
  if (action === "revoke") {
    if (target === normalizeEmail(requester)) return {ok: false, error: "Vous ne pouvez pas retirer votre propre accès."};
    if (isAdmin(target, env)) return {ok: false, error: "Un administrateur ne peut pas être retiré d'ici."};
  }
  return {ok: true, email: target, displayName: name};
}

module.exports = {normalizeEmail, adminEmails, isAdmin, checkAccessRequest};
