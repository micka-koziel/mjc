/**
 * manageAccess — l'administrateur de l'instance donne ou retire l'accès à
 * l'application (ex. démo pour un associé ou un client).
 *
 *  - list   : personnes autorisées (nom, dernière connexion) ;
 *  - grant  : crée le compte s'il n'existe pas (adresse considérée comme
 *             confirmée : c'est l'administrateur qui l'invite), l'ajoute à la
 *             liste d'accès. L'application envoie ensuite à la personne
 *             l'e-mail Firebase pour choisir son mot de passe : aucun mot de
 *             passe ne transite par l'administrateur ;
 *  - revoke : retire de la liste, désactive le compte et coupe ses sessions.
 */
const {onRequest} = require("firebase-functions/v2/https");
const {logger} = require("firebase-functions");
const {db, admin} = require("../lib/firebase-admin");
const {requireUser} = require("../lib/admin-auth");
const {ALLOWED_ORIGINS} = require("../lib/cors");
const {isAdmin, checkAccessRequest, normalizeEmail} = require("../lib/access");
const {maskEmail} = require("../lib/log-redact");

const ACCESS_DOC = db.collection("app_settings").doc("access");

async function findUser(email) {
  try {
    return await admin.auth().getUserByEmail(email);
  } catch (err) {
    if (err.code === "auth/user-not-found") return null;
    throw err;
  }
}

async function listAccess() {
  const snap = await ACCESS_DOC.get();
  const emails = (snap.exists && Array.isArray(snap.get("allowed_emails")) ? snap.get("allowed_emails") : []).map(normalizeEmail);
  const people = [];
  for (const email of emails) {
    const u = await findUser(email);
    people.push({
      email,
      displayName: (u && u.displayName) || "",
      admin: isAdmin(email),
      lastSignIn: (u && u.metadata && u.metadata.lastSignInTime) || null,
      disabled: Boolean(u && u.disabled),
    });
  }
  return people;
}

exports.manageAccess = onRequest(
    {region: "europe-west1", cors: ALLOWED_ORIGINS, timeoutSeconds: 30, invoker: "public"},
    async (req, res) => {
      if (req.method !== "POST") return res.status(405).json({error: "Method not allowed"});
      let principal;
      try {
        principal = await requireUser(req);
      } catch (authErr) {
        return res.status(authErr.status || 401).json({error: authErr.message});
      }
      if (!isAdmin(principal.email)) return res.status(403).json({error: "Réservé à l'administrateur de l'application."});

      const {action, email, displayName} = req.body || {};
      try {
        if (action === "list") return res.status(200).json({people: await listAccess()});
        if (action !== "grant" && action !== "revoke") return res.status(400).json({error: "Action inconnue."});
        const check = checkAccessRequest({action, email, displayName, requester: principal.email});
        if (!check.ok) return res.status(400).json({error: check.error});

        if (action === "grant") {
          let user = await findUser(check.email);
          const created = !user;
          if (created) {
            user = await admin.auth().createUser({email: check.email, emailVerified: true, displayName: check.displayName || undefined});
          } else {
            await admin.auth().updateUser(user.uid, {disabled: false, emailVerified: true, ...(check.displayName ? {displayName: check.displayName} : {})});
          }
          await ACCESS_DOC.set({allowed_emails: admin.firestore.FieldValue.arrayUnion(check.email)}, {merge: true});
          logger.info("manageAccess: accès donné", {by: maskEmail(principal.email), to: maskEmail(check.email), created});
          return res.status(200).json({ok: true, created, people: await listAccess()});
        }

        await ACCESS_DOC.set({allowed_emails: admin.firestore.FieldValue.arrayRemove(check.email)}, {merge: true});
        const user = await findUser(check.email);
        if (user) {
          await admin.auth().updateUser(user.uid, {disabled: true});
          await admin.auth().revokeRefreshTokens(user.uid);
        }
        logger.info("manageAccess: accès retiré", {by: maskEmail(principal.email), to: maskEmail(check.email)});
        return res.status(200).json({ok: true, people: await listAccess()});
      } catch (err) {
        logger.error("manageAccess: échec", {action, error: err.message});
        return res.status(500).json({error: "Opération impossible pour le moment."});
      }
    },
);
