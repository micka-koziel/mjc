/**
 * admin-auth.js — contrôle d'accès des fonctions HTTP.
 *
 * Simplification KHentik de lib/admin-auth.js (Trendl) : Trendl gérait
 * des rôles (créateur, admin, super-admin), l'impersonation et la double
 * authentification. Le package n'a qu'un profil : les personnes autorisées
 * à utiliser la boîte de l'instance. Une instance = un client = un projet
 * Firebase, donc une seule boîte partagée par ses utilisateurs autorisés.
 *
 * Autorisation : jeton Firebase valide ET e-mail présent dans la liste des
 * personnes autorisées = document Firestore app_settings/access, champ
 * `allowed_emails` (la MÊME liste que celle lue par firestore.rules), plus
 * le paramètre ALLOWED_EMAILS (virgules) s'il est renseigné.
 * Liste vide = personne : on refuse par défaut.
 *
 * Signatures conservées (requireAdmin → email ; requireRole → principal) pour
 * que les fonctions reprises de Trendl n'aient pas à changer.
 */
const {admin, db} = require("./firebase-admin");

function allowedEmails(env = process.env, docList = []) {
  return [
    ...String(env.ALLOWED_EMAILS || "").split(","),
    ...(Array.isArray(docList) ? docList : []),
  ]
      .map((s) => String(s || "").trim().toLowerCase())
      .filter(Boolean);
}

let accessCache = {at: 0, list: []};
async function readAccessList() {
  if (Date.now() - accessCache.at < 60 * 1000) return accessCache.list;
  const snap = await db.collection("app_settings").doc("access").get();
  const list = snap.exists && Array.isArray(snap.get("allowed_emails")) ? snap.get("allowed_emails") : [];
  accessCache = {at: Date.now(), list};
  return list;
}

async function verifyBearerToken(req) {
  const header = req.headers?.authorization || "";
  const match = /^Bearer (.+)$/.exec(header);
  if (!match) {
    const err = new Error("Authentification requise.");
    err.status = 401;
    throw err;
  }
  try {
    return await admin.auth().verifyIdToken(match[1]);
  } catch {
    const err = new Error("Session invalide ou expirée.");
    err.status = 401;
    throw err;
  }
}

/**
 * @param {object} req requête HTTP
 * @param {object} [deps] {verify, env} injectables (tests)
 * @return {Promise<{uid: string, email: string, role: "user"}>}
 */
async function requireUser(req, deps = {}) {
  const decoded = await (deps.verify || verifyBearerToken)(req);
  const email = String(decoded.email || "").toLowerCase();
  const docList = deps.readAccessList ? await deps.readAccessList() : await readAccessList().catch(() => []);
  if (!email || !allowedEmails(deps.env, docList).includes(email)) {
    const err = new Error("Accès non autorisé pour ce compte.");
    err.status = 403;
    throw err;
  }
  return {uid: decoded.uid, email, role: "user"};
}

async function requireRole(req) {
  return requireUser(req);
}

async function requireAdmin(req) {
  const principal = await requireUser(req);
  return principal.email;
}

module.exports = {allowedEmails, verifyBearerToken, requireUser, requireRole, requireAdmin};
