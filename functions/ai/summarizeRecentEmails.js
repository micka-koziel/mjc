/**
 * Cloud Function summarizeRecentEmails — Résumé IA des emails récents (Sprint 20, patché Sprint 21 PR2).
 *
 * HTTP onRequest callable depuis l'admin. Filtre les messages ingestés
 * dans les N dernières heures (12 par défaut) et demande à Sonnet 4.6
 * un résumé synthétique + classification par email + score d'importance.
 *
 * Sprint 21 PR2 — filtres ajoutés :
 *   1. labels contient INBOX (exclut mails déjà passés en SPAM/TRASH côté Gmail)
 *   2. exclusion Node-side des mails déjà triés Trendl (triaged_at non null)
 *
 * Optim coût : les messages ont DÉJÀ été analysés par `analyzeEmail`
 * (Sprint 12) — on a category, subtype et summary1Line en Firestore.
 * Sonnet est appelé UNE SEULE FOIS pour produire :
 *   - Une vue d'ensemble (3-5 phrases)
 *   - Pour chaque email : classification (opportunite/spam/autre) + score 1-5
 *
 * Auth : Bearer ID token Firebase Auth. Seuls les admins peuvent appeler.
 *
 * Région : europe-west1 (collocation avec Firestore + analyzeEmail).
 *
 * Secrets : ANTHROPIC_API_KEY.
 *
 * Note Firestore : la requête combine where("ingestedAt") + orderBy("ingestedAt")
 * + where("labels", "array-contains", "INBOX"). Firestore peut demander un
 * index composite au premier déploiement — il loggera un lien à cliquer
 * dans la console Firebase pour le créer en 1 click.
 */

const {onRequest} = require("firebase-functions/v2/https");
const {aiErrorResponse} = require("../lib/text-safe");
const {logger} = require("firebase-functions");
const {db, admin} = require("../lib/firebase-admin");
const {requireAdmin} = require("../lib/admin-auth");
const {
  getAnthropicClient,
  MODEL_SONNET,
} = require("../lib/anthropic-client");
const {generateStructured} = require("../lib/ai-provider");
const {summarizeEmailsOutputSchema} = require("../lib/validation/ai-schemas");

const DEFAULT_HOURS = 12;
// Plafond hard pour ne pas exploser le contexte Sonnet. On lit jusqu'à 100
// car on filtre ensuite Node-side (triaged_at), donc on a une marge.
const MAX_MESSAGES_FETCH = 100;
const MAX_MESSAGES_AI = 50;

const {ALLOWED_ORIGINS} = require("../lib/cors");

// KHentik : prompt générique (Trendl : « agence d'influence », classes
// opportunite/spam/autre). Aucune notion métier propre à un client.
const SYSTEM_PROMPT = `Tu es un assistant qui aide une petite entreprise à trier les e-mails reçus récemment.

On te donne une liste d'e-mails avec : id, expéditeur, sujet, résumé en une ligne (déjà calculé par une IA en amont), catégorie préanalysée et action attendue éventuelle.

Tu dois produire :
1. Une "vue d'ensemble" en 3-5 phrases en français (un humain doit pouvoir lire 1 paragraphe et comprendre ce qui s'est passé sur la période).
2. Pour CHAQUE email reçu, sa classification finale parmi : "a_traiter" (une réponse ou une action est attendue), "information" (à lire, sans action), "spam" (publicité non sollicitée, hameçonnage, arnaque).
N'invente rien : appuie-toi uniquement sur les informations fournies.
3. Pour CHAQUE email, un score d'importance de 1 à 5 (1 = à ignorer, 5 = très important à traiter aujourd'hui).

Réponds via l'outil 'summarize_emails' fourni — ne renvoie JAMAIS de texte en dehors de l'outil.`;

const TOOL_SUMMARIZE = {
  name: "summarize_emails",
  description:
    "Produit un résumé synthétique d'une période + classification par email.",
  input_schema: {
    type: "object",
    properties: {
      summary_text: {
        type: "string",
        description: "Vue d'ensemble en 3-5 phrases, en français.",
      },
      items: {
        type: "array",
        items: {
          type: "object",
          properties: {
            id: {type: "string", description: "ID du message"},
            classification: {
              type: "string",
              enum: ["a_traiter", "information", "spam"],
            },
            score: {
              type: "integer",
              minimum: 1,
              maximum: 5,
            },
          },
          required: ["id", "classification", "score"],
        },
      },
    },
    required: ["summary_text", "items"],
  },
};

exports.summarizeRecentEmails = onRequest(
  {
    region: "europe-west1",
    secrets: ["ANTHROPIC_API_KEY"],
    cors: ALLOWED_ORIGINS,
    timeoutSeconds: 60,
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
      logger.warn("summarizeRecentEmails: auth failed", {
        error: authErr.message,
      });
      return res
        .status(authErr.status || 401)
        .json({error: authErr.message});
    }

    try {
      const hours = Math.min(
        Math.max(parseInt(req.body?.hours, 10) || DEFAULT_HOURS, 1),
        72,
      );
      const sinceMs = Date.now() - hours * 3600 * 1000;
      const sinceTs = admin.firestore.Timestamp.fromMillis(sinceMs);

      logger.info("summarizeRecentEmails: starting", {
        hours,
        sinceIso: new Date(sinceMs).toISOString(),
        adminEmail,
      });

      // Sprint 21 PR2 : filtre INBOX (exclut SPAM/TRASH passés via Trendl
      // ou côté Gmail directement). Le doc Firestore garde un snapshot
      // des labels mis à jour par applyGmailAction.
      const snap = await db
        .collection("messages")
        .where("ingestedAt", ">=", sinceTs)
        .where("labels", "array-contains", "INBOX")
        .orderBy("ingestedAt", "desc")
        .limit(MAX_MESSAGES_FETCH)
        .get();

      let excludedTriaged = 0;
      const messages = [];
      snap.forEach((doc) => {
        const d = doc.data();
        // Sprint 21 PR2 : exclusion Node-side des mails déjà triés dans l'app
        // (l'admin a déjà décidé quoi en faire, pas besoin de les revoir).
        if (d.triaged_at) {
          excludedTriaged += 1;
          return;
        }
        if (messages.length >= MAX_MESSAGES_AI) return;
        messages.push({
          id: doc.id,
          from: d.from || "",
          subject: d.subject || "",
          snippet: d.snippet || "",
          threadId: d.threadId || doc.id,
          summary1Line: d.analysis?.summary1Line || "",
          category: d.analysis?.category || "unknown",
          expectedAction: d.analysis?.expectedAction || "",
        });
      });

      logger.info("summarizeRecentEmails: messages fetched", {
        fetched: snap.size,
        kept: messages.length,
        excludedTriaged,
      });

      if (messages.length === 0) {
        return res.status(200).json({
          summary_text: `Aucun email INBOX non trié ces ${hours} dernières heures.`,
          items: [],
          meta: {
            hours,
            messagesAnalysed: 0,
            filters: {inbox: true, excludeTriaged: true},
            excludedTriaged,
          },
        });
      }

      const client = await getAnthropicClient();
      const userMessage = buildUserMessage(messages, hours);

      const startTime = Date.now();
      // Interface neutre generateStructured (S67, A15) : budget + coût +
      // validation zod, dialecte Anthropic isolé dans l'adaptateur.
      const payload = await generateStructured(client, {
        model: MODEL_SONNET,
        system: SYSTEM_PROMPT,
        user: userMessage,
        tool: TOOL_SUMMARIZE,
        schema: summarizeEmailsOutputSchema,
        maxTokens: 2048,
        label: "summarizeRecentEmails",
      });
      const durationMs = Date.now() - startTime;

      const byId = new Map(messages.map((m) => [m.id, m]));
      const enrichedItems = (payload.items || [])
        .map((it) => {
          const src = byId.get(it.id);
          if (!src) return null;
          return {
            ...it,
            threadId: src.threadId,
            subject: src.subject,
            snippet: src.summary1Line || src.snippet,
            expectedAction: src.expectedAction || null,
            from: src.from,
          };
        })
        .filter(Boolean);

      enrichedItems.sort((a, b) => {
        if (b.score !== a.score) return b.score - a.score;
        const rank = {a_traiter: 0, information: 1, spam: 2};
        return (rank[a.classification] || 1) - (rank[b.classification] || 1);
      });

      logger.info("summarizeRecentEmails: completed", {
        durationMs,
        itemsCount: enrichedItems.length,
        hallucinated: (payload.items || []).length - enrichedItems.length,
      });

      return res.status(200).json({
        summary_text: payload.summary_text,
        items: enrichedItems,
        meta: {
          hours,
          model: MODEL_SONNET,
          durationMs,
          messagesAnalysed: messages.length,
          filters: {inbox: true, excludeTriaged: true},
          excludedTriaged,
        },
      });
    } catch (err) {
      logger.error("summarizeRecentEmails error", {
        error: err.message,
        stack: err.stack,
      });
      // Sprint 104.1 — erreur IA lisible (crédit épuisé, surcharge…).
      const out = aiErrorResponse(err);
      return res.status(out.status).json(out.body);
    }
  },
);

/**
 * Construit le contenu user envoyé à Sonnet.
 * @param {object[]} messages
 * @param {number} hours
 */
function buildUserMessage(messages, hours) {
  const lines = messages.map((m, idx) => {
    const summary = m.summary1Line || m.snippet?.slice(0, 200) || "";
    return `[${idx + 1}] id=${m.id}
  from: ${m.from}
  subject: ${m.subject}
  catégorie (préanalysée): ${m.category}
  action attendue: ${m.expectedAction || "aucune"}
  résumé: ${summary}`;
  });
  return `Emails ingérés ces ${hours} dernières heures (${messages.length} au total) :

${lines.join("\n\n")}

Produis le résumé via l'outil summarize_emails.`;
}
