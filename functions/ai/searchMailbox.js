/**
 * searchMailbox — Sprint 97 (Aurel, 13/10 : « quand je fais une recherche dans
 * la mailbox ça ne me trouve souvent rien »).
 *
 * POST {q} → {threadIds}. Pose la question à Gmail (objet, corps, pièces
 * jointes, toutes dates) et renvoie les fils trouvés. L'écran relit ensuite
 * ces fils dans Firestore (lecture bornée) pour les afficher. Rien n'est
 * écrit. Accès : rôle admin (même garde que downloadEmailAttachment).
 */

const {onRequest} = require("firebase-functions/v2/https");
const {logger} = require("firebase-functions");
const {requireRole} = require("../lib/admin-auth");
const {ALLOWED_ORIGINS} = require("../lib/cors");
const {createGmailClientAuto, withGmailBackoff} = require("../lib/gmail-client");
const {buildGmailQuery, threadIdsFromGmail, MAX_THREADS} = require("../lib/mailbox-search");
const {db} = require("../lib/firebase-admin");
const {isSimulatedMailbox, searchSimulated} = require("../lib/simulated-mailbox");

exports.searchMailbox = onRequest(
    {
      region: "europe-west1",
      cors: ALLOWED_ORIGINS,
      // Boîte simulée : aucun secret Gmail nécessaire.
      secrets: isSimulatedMailbox() ? [] : ["GMAIL_CLIENT_SECRET", "GMAIL_REFRESH_TOKEN"],
      timeoutSeconds: 30,
      memory: "256MiB",
    },
    async (req, res) => {
      if (req.method !== "POST") {
        return res.status(405).json({error: "Method not allowed"});
      }
      try {
        await requireRole(req, "admin");
      } catch (authErr) {
        return res.status(authErr.status || 401).json({error: authErr.message});
      }
      if (isSimulatedMailbox()) {
        const raw = String((req.body && req.body.q) || "").slice(0, 200);
        const snap = await db.collection("messages").limit(800).get();
        return res.status(200).json({threadIds: searchSimulated(snap.docs.map((d) => d.data()), raw, MAX_THREADS)});
      }
      const q = buildGmailQuery(req.body && req.body.q);
      if (!q) return res.status(200).json({threadIds: []});
      try {
        const gmail = await createGmailClientAuto();
        const out = await withGmailBackoff(() =>
          gmail.users.threads.list({userId: "me", q, maxResults: MAX_THREADS}),
        );
        return res.status(200).json({threadIds: threadIdsFromGmail(out && out.data)});
      } catch (err) {
        logger.error("searchMailbox: échec", {error: err && err.message});
        return res.status(500).json({error: "Recherche Gmail indisponible."});
      }
    },
);
