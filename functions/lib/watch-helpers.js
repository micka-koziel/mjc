/**
 * Helpers pour le watch Gmail.
 *
 * Factorise la logique commune entre :
 *   - functions/ingest/startWatch.js          (HTTPS, déclenchement initial)
 *   - functions/schedule/renewWatch.js        (Scheduler quotidien)
 *   - functions/schedule/checkIngestionHealth.js (Sprint 14 — auto-recovery 30 min)
 *
 * La seule différence métier entre les trois : le label de timestamp
 * écrit dans Firestore (watchStartedAt / watchRenewedAt / watchRecoveredAt).
 */

const { db, admin } = require("./firebase-admin");
const { createGmailClientAuto, startWatch } = require("./gmail-client");

// KHentik : sujet Pub/Sub construit depuis le projet de l'instance
// (Trendl : projects/trendl-app/topics/trendl-emails-inbound, codé en dur).
const TOPIC_NAME =
  process.env.GMAIL_WATCH_TOPIC ||
  `projects/${process.env.GCLOUD_PROJECT || process.env.GOOGLE_CLOUD_PROJECT}/topics/${
    process.env.GMAIL_PUBSUB_TOPIC_NAME || "khentik-emails-inbound"}`;

const WATCH_DOC = "system/gmail-watch";

/**
 * Sprint 82.1 — Faut-il remettre le marque-page (lastHistoryId) au point de
 * départ de la nouvelle boîte ? PUR (testable sans Firestore).
 *
 * - mode "started" : relance manuelle = bascule assumée → toujours reset.
 * - autre mode : reset uniquement si la boîte écoutée a CHANGÉ depuis le
 *   dernier armement (les historyId sont propres à chaque boîte Gmail —
 *   garder le curseur de l'ancienne bloquerait listHistory en boucle).
 *
 * @param {"started"|"renewed"|"recovery"} mode
 * @param {string|null} previousEmail watch_email précédent (null = inconnu)
 * @param {string} watchEmail boîte réellement écoutée par le nouveau watch
 * @return {boolean}
 */
function shouldResetCursor(mode, previousEmail, watchEmail) {
  if (mode === "started") return true;
  return previousEmail !== null && previousEmail !== watchEmail;
}

/**
 * Démarre (ou renouvelle / récupère) le watch Gmail et écrit son état dans Firestore.
 *
 * @param {"started"|"renewed"|"recovery"} mode Label métier pour le timestamp Firestore
 *   - "started"  → écrit watchStartedAt   (1er armement via UI admin)
 *   - "renewed"  → écrit watchRenewedAt   (cron quotidien renewWatch)
 *   - "recovery" → écrit watchRecoveredAt (cron 30 min checkIngestionHealth)
 * @returns {Promise<{historyId: string, expirationMs: number}>}
 */
async function performWatch(mode) {
  // Sprint 82 (B157) — créds résolues via le compte exploitant (repli global).
  const gmail = await createGmailClientAuto();
  const result = await startWatch(gmail, TOPIC_NAME);
  const expirationMs = parseInt(result.expiration, 10);

  // Sprint 82.1 — on mémorise QUELLE boîte est écoutée. Sert de filtre côté
  // ingestEmail : les notifications d'une ANCIENNE boîte (watch pas encore
  // expiré chez Google) sont ignorées au lieu de polluer le curseur.
  const profile = await gmail.users.getProfile({ userId: "me" });
  const watchEmail = (profile.data.emailAddress || "").toLowerCase();

  let tsField;
  switch (mode) {
    case "renewed":
      tsField = "watchRenewedAt";
      break;
    case "recovery":
      tsField = "watchRecoveredAt";
      break;
    case "started":
    default:
      tsField = "watchStartedAt";
      break;
  }

  const update = {
    watchHistoryId: result.historyId,
    watchExpiration: expirationMs,
    watch_email: watchEmail,
    [tsField]: admin.firestore.FieldValue.serverTimestamp(),
  };

  // Sprint 82.1 — BASCULE DE BOÎTE : les historyId sont propres à CHAQUE
  // boîte Gmail. Un « Relancer le watch » manuel (mode started) est une
  // bascule assumée → on remet le marque-page de lecture au point de départ
  // de la nouvelle boîte. Idem si la boîte écoutée a CHANGÉ depuis le
  // dernier armement (recovery/renewed après un changement d'exploitant),
  // sinon le curseur de l'ancienne boîte bloque listHistory (404) en boucle.
  const snap = await db.doc(WATCH_DOC).get();
  const previousEmail = snap.exists ? snap.data().watch_email || null : null;
  if (shouldResetCursor(mode, previousEmail, watchEmail)) {
    update.lastHistoryId = result.historyId;
  }

  await db.doc(WATCH_DOC).set(update, { merge: true });

  return { historyId: result.historyId, expirationMs, watchEmail };
}

module.exports = { performWatch, shouldResetCursor, TOPIC_NAME, WATCH_DOC };
