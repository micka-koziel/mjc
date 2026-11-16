/**
 * Cloud Function applyGmailAction — Sync application → Gmail
 * (reprise de Trendl, Sprint 21 PR1 + atomicité Firestore PR2).
 * KHentik : action « label_opportunity » retirée (tag CRM).
 *
 * Permet aux actions one-click prises dans Trendl (Spam, Poubelle, Ignorer,
 * Opportunité) de se refléter directement dans Gmail :
 *
 *  - action='trash'              → corbeille Gmail (récupérable 30j) + triage_reason='trash'
 *  - action='spam'               → label SPAM + retire INBOX + triage_reason='spam'
 *  - action='archive'            → retire INBOX (= raccourci E sur Gmail) + triage_reason='ignored'
 *  - action='label_opportunity'  → ajoute label custom "Opportunité Trendl"
 *                                  (PAS de triage_reason — c'est juste un tag,
 *                                  la création d'opp Trendl reste source de vérité)
 *  - action='mark_read'          → retire le label UNREAD (Sprint 89 : un
 *                                  email consulté/traité dans Trendl apparaît
 *                                  lu dans Gmail). PAS de triage_reason —
 *                                  lire n'est pas trier.
 *
 * Effets de bord Firestore (atomiques en un seul set merge) :
 *  - messages.{id}.gmail_synced_at        = serverTimestamp()
 *  - messages.{id}.gmail_synced_action    = action
 *  - messages.{id}.gmail_synced_by        = adminEmail
 *  - messages.{id}.labels                 = snapshot Gmail post-action
 *    (CRUCIAL pour le filtre INBOX-only du résumé IA — sinon le doc
 *    Firestore garde la copie des labels au moment de l'ingestion et ne
 *    reflète pas qu'on a passé le mail en SPAM/TRASH/archive)
 *  - messages.{id}.triaged_at             = serverTimestamp() (si action ≠ label_opportunity)
 *  - messages.{id}.triage_reason          = trash/spam/ignored (si action ≠ label_opportunity)
 *
 * Auth : Bearer ID token Firebase Auth, role admin minimum.
 * Région : europe-west1 (cohérence avec le reste).
 * Secrets : GMAIL_CLIENT_SECRET, GMAIL_REFRESH_TOKEN.
 *
 * Scope OAuth nécessaire : gmail.modify (élargi en PR1, cf initOAuth.js).
 */

const {onRequest} = require("firebase-functions/v2/https");
const {logger} = require("firebase-functions");
const {db, admin} = require("../lib/firebase-admin");
const {requireAdmin} = require("../lib/admin-auth");
const {maskEmail} = require("../lib/log-redact");
const {
  createGmailClientAuto,
  trashMessage,
  modifyLabels,
} = require("../lib/gmail-client");
const {ALLOWED_ORIGINS} = require("../lib/cors");

const VALID_ACTIONS = new Set([
  "trash",
  "spam",
  "archive",
  "mark_read",
]);

// Mapping action Gmail → triage_reason. KHentik : l'action
// « label_opportunity » (tag CRM de Trendl) est retirée.
const TRIAGE_REASONS = {
  trash: "trash",
  spam: "spam",
  archive: "ignored",
};

exports.applyGmailAction = onRequest(
  {
    region: "europe-west1",
    secrets: ["GMAIL_CLIENT_SECRET", "GMAIL_REFRESH_TOKEN"],
    cors: ALLOWED_ORIGINS,
    timeoutSeconds: 30,
    invoker: "public",
  },
  async (req, res) => {
    if (req.method !== "POST") {
      return res.status(405).json({error: "Method not allowed"});
    }

    let adminEmail;
    try {
      adminEmail = await requireAdmin(req);
    } catch (authErr) {
      logger.warn("applyGmailAction: auth failed", {error: authErr.message});
      return res
        .status(authErr.status || 401)
        .json({error: authErr.message});
    }

    try {
      const {messageId, action} = req.body || {};
      if (!messageId || typeof messageId !== "string") {
        return res.status(400).json({error: "messageId is required"});
      }
      if (!action || !VALID_ACTIONS.has(action)) {
        return res.status(400).json({
          error: `action must be one of: ${Array.from(VALID_ACTIONS).join(", ")}`,
        });
      }

      // 1. Récupérer le doc Firestore (l'id Firestore = id Gmail par convention ingestEmail.js)
      const msgRef = db.collection("messages").doc(messageId);
      const msgSnap = await msgRef.get();
      if (!msgSnap.exists) {
        return res.status(404).json({error: `Message ${messageId} not found`});
      }
      const msg = msgSnap.data();
      const gmailId = msg.gmailId || messageId;

      // 2. Créer client Gmail authentifié
      // Sprint 82 (B157) — créds résolues via le compte exploitant (repli global).
      const gmail = await createGmailClientAuto();

      // 3. Exécuter l'action Gmail correspondante
      let resultLabels;
      switch (action) {
        case "trash": {
          const r = await trashMessage(gmail, gmailId);
          resultLabels = r.labelIds;
          break;
        }
        case "spam": {
          // Sprint 89 — trier = traiter : on retire aussi UNREAD (lu).
          const r = await modifyLabels(gmail, gmailId, {
            add: ["SPAM"],
            remove: ["INBOX", "UNREAD"],
          });
          resultLabels = r.labelIds;
          break;
        }
        case "archive": {
          const r = await modifyLabels(gmail, gmailId, {
            remove: ["INBOX", "UNREAD"],
          });
          resultLabels = r.labelIds;
          break;
        }
        case "mark_read": {
          // Sprint 89 — UNREAD est un label système Gmail (id = nom), pas
          // besoin de getOrCreateLabel (cf commentaire gmail-client.js).
          const r = await modifyLabels(gmail, gmailId, {remove: ["UNREAD"]});
          resultLabels = r.labelIds;
          break;
        }
        default:
          // Should never happen — validated above
          throw new Error(`Unhandled action: ${action}`);
      }

      // 4. Update Firestore atomique : sync Gmail + triage Trendl
      const triageReason = TRIAGE_REASONS[action]; // undefined pour label_opportunity → pas de triage écrit
      const updates = {
        gmail_synced_at: admin.firestore.FieldValue.serverTimestamp(),
        gmail_synced_action: action,
        gmail_synced_by: adminEmail,
        labels: resultLabels || [],
      };
      if (triageReason) {
        updates.triaged_at = admin.firestore.FieldValue.serverTimestamp();
        updates.triage_reason = triageReason;
      }
      await msgRef.set(updates, {merge: true});

      logger.info("applyGmailAction: success", {
        messageId,
        gmailId,
        action,
        triageReason: triageReason || null,
        adminEmail: maskEmail(adminEmail),
        labelsAfter: resultLabels,
      });

      return res.status(200).json({
        success: true,
        action,
        triageReason: triageReason || null,
        labelsAfter: resultLabels || [],
      });
    } catch (err) {
      // Erreurs Gmail API typiques :
      //  - 404 : message déjà supprimé / introuvable
      //  - 401/403 : token invalide ou scope insuffisant (= besoin de re-OAuth)
      //  - 429 : quota dépassé
      const gmailStatus = err?.response?.status || err?.code;
      logger.error("applyGmailAction error", {
        error: err.message,
        gmailStatus,
        stack: err.stack,
      });
      return res.status(500).json({
        error: err.message,
        gmailStatus: gmailStatus || null,
      });
    }
  },
);
