/**
 * Cloud Functions du package KHentik — périmètre e-mails uniquement.
 * Extraites de trendl-app/functions/index.js (environ 110 fonctions dont
 * CRM, recouvrement, créateurs, prospection, veille… non reprises).
 */
const {setGlobalOptions} = require("firebase-functions");

setGlobalOptions({maxInstances: 10});

require("./lib/sentry").initSentry();

const {isSimulatedMailbox} = require("./lib/simulated-mailbox");

if (isSimulatedMailbox()) {
  // Boîte de DÉMONSTRATION (MAILBOX_PROVIDER=simulated) : pas de Gmail ;
  // jeu d'e-mails fictifs du client, remis à neuf à la demande.
  exports.resetDemoMailbox = require("./demo/resetDemoMailbox").resetDemoMailbox;
} else {
  // Connexion Gmail (OAuth) — repris
  exports.initOAuth = require("./oauth/initOAuth").initOAuth;
  exports.callbackOAuth = require("./oauth/callbackOAuth").callbackOAuth;

  // Réception des e-mails (Pub/Sub Gmail) — repris
  exports.ingestEmail = require("./ingest/ingestEmail").ingestEmail;
  exports.startWatch = require("./ingest/startWatch").startWatch;
  exports.renewWatch = require("./schedule/renewWatch").renewWatch;
  exports.checkIngestionHealth = require("./schedule/checkIngestionHealth").checkIngestionHealth;
}

// Analyse IA générique de chaque e-mail — adapté
exports.analyzeEmail = require("./analyze/analyzeEmail").analyzeEmail;

// Mailbox — repris / adapté
exports.applyGmailAction = require("./ai/applyGmailAction").applyGmailAction;
exports.searchMailbox = require("./ai/searchMailbox").searchMailbox;
exports.summarizeRecentEmails = require("./ai/summarizeRecentEmails").summarizeRecentEmails;

// Espace de traitement — résumé de fil (ajouté), brouillon (adapté), envoi (repris)
exports.summarizeThread = require("./ai/summarizeThread").summarizeThread;
exports.generateReplyDraft = require("./ai/generateReplyDraft").generateReplyDraft;
exports.sendReplyDraft = require("./ai/sendReplyDraft").sendReplyDraft;

// Assistant conversationnel — adapté (alfredChat sans CRM)
exports.assistantChat = require("./assistants/assistantChat").assistantChat;
