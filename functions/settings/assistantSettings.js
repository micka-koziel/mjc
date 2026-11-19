/**
 * assistantSettings — lecture et enregistrement des réglages de l'assistant
 * (écran « Réglages » de l'application), par toute personne autorisée.
 *
 *  - get  : réglages enregistrés (null si jamais modifiés) + valeurs de
 *           départ issues du questionnaire (consignes de priorité, style) ;
 *  - save : { kind: "priorities" | "replies", value } validé (zod), puis
 *           écrit dans app_settings ; pris en compte par l'IA sous une minute.
 */
const {onRequest} = require("firebase-functions/v2/https");
const {logger} = require("firebase-functions");
const {db, admin} = require("../lib/firebase-admin");
const {requireRole} = require("../lib/admin-auth");
const {ALLOWED_ORIGINS} = require("../lib/cors");
const {loadAiProfile} = require("../lib/ai-profile");
const {DOCS, validateSettings, readAssistantSettings, clearAssistantSettingsCache} = require("../lib/assistant-settings");

/** Valeurs de départ, tirées du questionnaire (profil installé avec les fonctions). */
function startingValues(profile = loadAiProfile()) {
  const c = profile.context || {};
  const s = profile.assistant || {};
  return {
    aiRules: [c.priorityExpectations, c.priorityRules, c.escalationRules].filter(Boolean).join("\n"),
    importantSenders: c.importantSenders || [],
    replies: {
      tone: s.tone, concision: s.concision, language: s.language, formality: s.formality,
      signatureText: s.signatureText || "", instructions: s.instructions || "", forbiddenTerms: s.forbiddenTerms || "",
    },
  };
}

exports.assistantSettings = onRequest(
    {region: "europe-west1", cors: ALLOWED_ORIGINS, timeoutSeconds: 30, invoker: "public"},
    async (req, res) => {
      if (req.method !== "POST") return res.status(405).json({error: "Method not allowed"});
      let principal;
      try {
        principal = await requireRole(req);
      } catch (authErr) {
        return res.status(authErr.status || 401).json({error: authErr.message});
      }
      const {action, kind, value} = req.body || {};
      try {
        if (action === "get") {
          const stored = await readAssistantSettings({fresh: true});
          return res.status(200).json({...stored, defaults: startingValues()});
        }
        if (action !== "save") return res.status(400).json({error: "Action inconnue."});
        const check = validateSettings(kind, value);
        if (!check.ok) return res.status(400).json({error: check.error});
        await db.collection("app_settings").doc(DOCS[kind]).set({
          value: check.value,
          updated_at: admin.firestore.FieldValue.serverTimestamp(),
          updated_by: principal.uid,
        });
        clearAssistantSettingsCache();
        logger.info("assistantSettings: réglages enregistrés", {kind, by: principal.uid});
        return res.status(200).json({ok: true, value: check.value});
      } catch (err) {
        logger.error("assistantSettings: échec", {action, error: err.message});
        return res.status(500).json({error: "Réglages indisponibles pour le moment."});
      }
    },
);

exports.startingValues = startingValues;
