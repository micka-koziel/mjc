/**
 * resetDemoMailbox — remet la boîte de démonstration à neuf : efface les
 * e-mails, brouillons, résumés, conversations de l'assistant et tâches, puis
 * réécrit le jeu fictif du client (functions/config/demo-mailbox.json), daté
 * « du jour ». L'analyse IA de chaque e-mail repart automatiquement
 * (analyzeEmail se déclenche à l'écriture).
 *
 * Refusé si la boîte n'est pas simulée : impossible d'effacer une vraie boîte.
 */
const {onRequest} = require("firebase-functions/v2/https");
const {logger} = require("firebase-functions");
const {db, admin} = require("../lib/firebase-admin");
const {requireRole} = require("../lib/admin-auth");
const {ALLOWED_ORIGINS} = require("../lib/cors");
const {isSimulatedMailbox, buildSeedDocs, loadDemoDataset} = require("../lib/simulated-mailbox");

const COLLECTIONS_TO_CLEAR = ["messages", "message_drafts", "thread_summaries", "assistant_conversations", "todos"];

async function clearCollection(name) {
  for (;;) {
    const snap = await db.collection(name).limit(400).get();
    if (snap.empty) return;
    const batch = db.batch();
    snap.docs.forEach((d) => batch.delete(d.ref));
    await batch.commit();
  }
}

exports.resetDemoMailbox = onRequest(
    {region: "europe-west1", cors: ALLOWED_ORIGINS, timeoutSeconds: 120, invoker: "public"},
    async (req, res) => {
      if (req.method !== "POST") return res.status(405).json({error: "Method not allowed"});
      let principal;
      try {
        principal = await requireRole(req);
      } catch (authErr) {
        return res.status(authErr.status || 401).json({error: authErr.message});
      }
      if (!isSimulatedMailbox()) {
        return res.status(403).json({error: "Réinitialisation réservée à une boîte de démonstration."});
      }
      const dataset = loadDemoDataset();
      if (!dataset) return res.status(500).json({error: "Jeu de démonstration absent (functions/config/demo-mailbox.json)."});
      try {
        for (const name of COLLECTIONS_TO_CLEAR) await clearCollection(name);
        const {messages, todos} = buildSeedDocs(dataset, Date.now());
        const ts = (ms) => admin.firestore.Timestamp.fromMillis(ms);
        const batch = db.batch();
        for (const {id, doc} of messages) {
          const {receivedAtMs, ...rest} = doc;
          batch.set(db.collection("messages").doc(id), {
            ...rest,
            receivedAt: ts(receivedAtMs),
            ingestedAt: admin.firestore.FieldValue.serverTimestamp(),
          });
        }
        for (const {id, doc} of todos) {
          const {created_at_ms: createdAtMs, ...rest} = doc;
          batch.set(db.collection("todos").doc(id), {
            ...rest,
            created_at: ts(createdAtMs),
            updated_at: admin.firestore.FieldValue.serverTimestamp(),
          });
        }
        await batch.commit();
        logger.info("resetDemoMailbox: boîte réinitialisée", {by: principal.uid, messages: messages.length, todos: todos.length});
        return res.status(200).json({ok: true, messages: messages.length, todos: todos.length});
      } catch (err) {
        logger.error("resetDemoMailbox: échec", {error: err.message});
        return res.status(500).json({error: "Réinitialisation impossible."});
      }
    },
);
