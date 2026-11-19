/**
 * assistantChat — assistant conversationnel de l'accueil (questions libres).
 *
 * Repris d'alfredChat (Trendl, Sprint 95) : agent à outils
 * (lib/ai-provider.runToolAgent, repris), outil de réponse finale
 * obligatoire, conversations par utilisateur dans assistant_conversations
 * (owner_uid vérifié), boîte récente gardée 2 minutes en mémoire.
 *
 * Changé : outils limités aux e-mails et aux tâches
 * (lib/mail-assistant-tools.js) ; aucun aperçu CRM ; aucune action proposée
 * ni exécutée (alfredExecute n'est pas repris) ; consignes génériques
 * tenant compte du nom et du style d'assistant de la configuration ;
 * réponse en texte simple (pas de flux d'étapes).
 *
 * Body : {question, conversationId?, assistant?: {name, tone, concision, language}}
 * Réponse : {conversationId, message: {role, text, at}}
 */
const {onRequest} = require("firebase-functions/v2/https");
const {logger} = require("firebase-functions");
const {db, admin} = require("../lib/firebase-admin");
const {requireRole} = require("../lib/admin-auth");
const {ALLOWED_ORIGINS} = require("../lib/cors");
const {getAnthropicClient, MODEL_HAIKU} = require("../lib/anthropic-client");
const {runToolAgent} = require("../lib/ai-provider");
const {readThreadMessages} = require("../lib/thread-reader");
const {publicAiError} = require("../lib/text-safe");
const {MAIL_TOOLS, FINAL_TOOL, createMailToolbox} = require("../lib/mail-assistant-tools");
const {buildAssistantSystem} = require("../lib/prompts-generic");
const {loadAiProfile} = require("../lib/ai-profile");
const {readAssistantSettings, effectiveProfile} = require("../lib/assistant-settings");

const CONVERSATIONS = "assistant_conversations";
const MAX_HISTORY = 20;

let recentCache = null;
function recentMessages() {
  const now = Date.now();
  if (recentCache && now - recentCache.at < 2 * 60 * 1000) return recentCache.promise;
  const promise = db.collection("messages").orderBy("receivedAt", "desc").limit(800).get()
      .then((snap) => snap.docs.map((d) => ({id: d.id, ...d.data()})));
  promise.catch(() => {
    recentCache = null;
  });
  recentCache = {at: now, promise};
  return promise;
}

exports.assistantChat = onRequest(
    {region: "europe-west1", cors: ALLOWED_ORIGINS, secrets: ["ANTHROPIC_API_KEY"], timeoutSeconds: 120, memory: "512MiB", invoker: "public"},
    async (req, res) => {
      if (req.method !== "POST") return res.status(405).json({error: "Method not allowed"});
      let principal;
      try {
        principal = await requireRole(req);
      } catch (authErr) {
        return res.status(authErr.status || 401).json({error: authErr.message});
      }
      const question = String(req.body?.question || "").trim().slice(0, 4000);
      if (!question) return res.status(400).json({error: "Question vide."});
      const prefs = req.body?.assistant && typeof req.body.assistant === "object" ? req.body.assistant : {};
      try {
        const requestedId = req.body?.conversationId ? String(req.body.conversationId) : null;
        const convRef = requestedId ? db.collection(CONVERSATIONS).doc(requestedId) : db.collection(CONVERSATIONS).doc();
        const convSnap = await convRef.get();
        if (requestedId && !convSnap.exists) return res.status(404).json({error: "Conversation introuvable."});
        if (convSnap.exists && convSnap.get("owner_uid") !== principal.uid) return res.status(403).json({error: "Conversation inaccessible."});
        const conv = convSnap.exists ? convSnap.data() : {messages: []};

        const toolbox = createMailToolbox({
          recentMessages,
          readThread: (threadId) => readThreadMessages(db, threadId, 40),
          loadTodos: () => db.collection("todos").limit(300).get().then((s) => s.docs.map((d) => ({id: d.id, ...d.data()}))),
        });
        const client = await getAnthropicClient();
        const result = await runToolAgent(client, {
          model: MODEL_HAIKU,
          system: buildAssistantSystem(
              prefs,
              {name: String(prefs.name || "Assistant").slice(0, 30), today: new Date().toISOString().slice(0, 10)},
              effectiveProfile(loadAiProfile(), await readAssistantSettings().catch(() => ({}))),
          ),
          history: (conv.messages || []).slice(-MAX_HISTORY),
          user: question,
          tools: MAIL_TOOLS,
          executeTool: toolbox.execute,
          terminalTool: FINAL_TOOL,
          maxTurns: 6,
          maxTokens: 1200,
          label: "assistantChat",
        });
        const text = String(result.final?.answer || result.text || "Je n'ai pas trouvé de réponse.").slice(0, 4000);
        const at = new Date().toISOString();
        const reply = {role: "assistant", text, at};
        const messages = [...(conv.messages || []), {role: "user", text: question, at}, reply].slice(-MAX_HISTORY * 2);
        await convRef.set({
          owner_uid: principal.uid,
          title: conv.title || question.slice(0, 60),
          messages,
          created_at: conv.created_at || admin.firestore.FieldValue.serverTimestamp(),
          updated_at: admin.firestore.FieldValue.serverTimestamp(),
        }, {merge: true});
        logger.info("assistantChat: tour", {conversationId: convRef.id, turns: result.turns, tools: result.toolLog.map((t) => t.name)});
        return res.status(200).json({conversationId: convRef.id, message: reply});
      } catch (err) {
        logger.error("assistantChat: échec", {error: err.message});
        const pub = publicAiError(err);
        return res.status(pub.status).json({error: pub.error});
      }
    },
);
