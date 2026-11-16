/**
 * Firebase Admin SDK singleton.
 *
 * Importé par toutes les Cloud Functions qui ont besoin d'accéder à Firestore.
 * Évite de réinitialiser l'app Admin à chaque invocation.
 */

const admin = require("firebase-admin");

if (!admin.apps.length) {
  admin.initializeApp();
}

const db = admin.firestore();

module.exports = {admin, db};
