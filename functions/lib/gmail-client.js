/**
 * Helpers Gmail API.
 *
 * - createOAuthClient()                          : crée un client OAuth2 (lit le secret depuis Secret Manager)
 * - createGmailClient(refreshToken)              : crée un client Gmail authentifié à partir d'un refresh token
 * - startWatch(gmail, topicName)                 : démarre un watch Pub/Sub sur la boîte INBOX
 * - listHistory(gmail, startHistoryId)           : liste les changements depuis un historyId donné
 * - trashMessage(gmail, gmailId)                 : déplace un message vers la corbeille Gmail [Sprint 21 PR1]
 * - modifyLabels(gmail, gmailId, add, remove)    : ajoute/retire des labels sur un message [Sprint 21 PR1]
 * - getOrCreateLabel(gmail, labelName)           : retourne l'id d'un label custom, le crée si absent [Sprint 21 PR1]
 *
 * Le refresh token est stocké dans Secret Manager (clé GMAIL_REFRESH_TOKEN) après le flow OAuth.
 * Le client secret OAuth est stocké dans Secret Manager (clé GMAIL_CLIENT_SECRET).
 * Le client ID OAuth et la redirect URI sont passés en variables d'environnement.
 */

// Sprint 92 (B185) — `googleapis` pèse 913 des 2 000 fichiers chargés par le
// codebase, soit près de la moitié. Ce module était requis en tête de fichier,
// donc chargé pour les 77 fonctions au moment de la découverte au déploiement
// (plafond 10 s, frôlé au sprint 91). Il n'est désormais chargé qu'au premier
// appel Gmail réel, et conservé pour les suivants.
let cachedGoogle = null;

/**
 * Retourne l'objet `google` de googleapis, chargé au premier usage.
 *
 * @return {object} Espace de noms googleapis
 */
function getGoogle() {
  if (!cachedGoogle) {
    cachedGoogle = require("googleapis").google;
  }
  return cachedGoogle;
}
const {readSecret} = require("./secret-manager");

const CLIENT_ID = process.env.GMAIL_CLIENT_ID;
const REDIRECT_URI = process.env.GMAIL_REDIRECT_URI;

// ===== Sprint 68 (M04-R6) — Backoff respectant Retry-After ================
// Quand Gmail répond « trop d'appels » (quota), il indique souvent COMBIEN de
// temps attendre via l'en-tête Retry-After. Au lieu de marteler l'API (ce qui
// aggrave le throttling), on PATIENTE le délai demandé, puis on réessaie — avec
// un repli exponentiel + jitter si l'en-tête est absent. Métaphore : un videur
// dit « repassez dans 30 s » ; on attend 30 s au lieu de tambouriner à la porte.

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

/**
 * Extrait le délai d'attente (ms) d'une erreur Gmail, depuis l'en-tête
 * Retry-After (secondes ou date HTTP). Renvoie null si absent/illisible. Pur.
 * @param {*} err
 * @return {number|null}
 */
function parseRetryAfterMs(err) {
  const headers = (err && err.response && err.response.headers) || {};
  const raw = headers["retry-after"] || headers["Retry-After"];
  if (raw === null || raw === undefined) return null;
  const asSeconds = Number(raw);
  if (!Number.isNaN(asSeconds)) return Math.max(0, asSeconds * 1000);
  const asDate = Date.parse(raw);
  if (!Number.isNaN(asDate)) return Math.max(0, asDate - Date.now());
  return null;
}

/**
 * L'erreur est-elle un dépassement de quota Gmail (à réessayer) ? Pur.
 * Couvre 429 et le 403 `rateLimitExceeded`/`userRateLimitExceeded` de Google.
 * @param {*} err
 * @return {boolean}
 */
function isRateLimitError(err) {
  const status = (err && (err.code || (err.response && err.response.status))) || null;
  if (status === 429 || status === "429") return true;
  if (status === 403 || status === "403") {
    const reason =
      (err && err.errors && err.errors[0] && err.errors[0].reason) ||
      (err && err.response && err.response.data && err.response.data.error &&
        err.response.data.error.errors && err.response.data.error.errors[0] &&
        err.response.data.error.errors[0].reason) ||
      "";
    return /rateLimitExceeded/i.test(reason) || /rate ?limit/i.test((err && err.message) || "");
  }
  return false;
}

/**
 * Exécute un appel Gmail en respectant le backoff Retry-After sur quota.
 * Réessaie jusqu'à `maxRetries` fois ; toute autre erreur est propagée telle
 * quelle (pas de retry aveugle).
 *
 * @param {() => Promise<T>} fn Appel Gmail à (ré)exécuter.
 * @param {object} [opts]
 * @param {number} [opts.maxRetries=4]
 * @param {number} [opts.baseDelayMs=1000]
 * @param {(ms:number, attempt:number)=>void} [opts.onWait] Hook (logs/tests).
 * @return {Promise<T>}
 * @template T
 */
async function withGmailBackoff(fn, {maxRetries = 4, baseDelayMs = 1000, onWait} = {}) {
  // Boucle for sans condition (pas de `while (true)` → pas de no-constant-condition).
  for (let attempt = 0; ; attempt++) {
    try {
      return await fn();
    } catch (err) {
      if (!isRateLimitError(err) || attempt >= maxRetries) throw err;
      const retryAfter = parseRetryAfterMs(err);
      const backoff =
        retryAfter === null ? baseDelayMs * 2 ** attempt : retryAfter;
      const waitMs = backoff + Math.floor(Math.random() * 250); // jitter anti-troupeau
      if (typeof onWait === "function") onWait(waitMs, attempt);
      await sleep(waitMs);
    }
  }
}

/**
 * Crée un client OAuth2 avec le secret lu depuis Secret Manager.
 * @return {Promise<import("google-auth-library").OAuth2Client>}
 */
async function createOAuthClient() {
  const clientSecret = await readSecret("GMAIL_CLIENT_SECRET");
  return new (getGoogle().auth.OAuth2)(CLIENT_ID, clientSecret, REDIRECT_URI);
}

/**
 * Crée un client Gmail authentifié à partir d'un refresh token.
 * @param {string} refreshToken
 * @return {Promise<import("googleapis").gmail_v1.Gmail>}
 */
async function createGmailClient(refreshToken) {
  const oauth2Client = await createOAuthClient();
  oauth2Client.setCredentials({refresh_token: refreshToken});
  return getGoogle().gmail({version: "v1", auth: oauth2Client});
}

/**
 * Sprint 82 (B157) — Crée un client Gmail en résolvant les créds via le
 * COMPTE EXPLOITANT (lib/user-secrets) : si un exploitant est désigné et
 * que son trio Gmail (client_id + client_secret + refresh_token) est
 * provisionné, la boîte utilisée est la SIENNE ; sinon repli sur les
 * secrets globaux (comportement historique, tout-ou-rien sur le trio).
 *
 * Point d'entrée à utiliser par TOUS les flux métier (ingestion, envois,
 * labels, watch). Les exports historiques restent pour le flow OAuth
 * (init/callback) qui manipule explicitement les créds globales.
 *
 * @return {Promise<import("googleapis").gmail_v1.Gmail>}
 */
async function createGmailClientAuto() {
  // require() paresseux — pas de cycle au chargement du module.
  const {resolveGmailCredentials} = require("./user-secrets");
  const creds = await resolveGmailCredentials();
  const oauth2Client = new (getGoogle().auth.OAuth2)(
      creds.clientId,
      creds.clientSecret,
      REDIRECT_URI,
  );
  oauth2Client.setCredentials({refresh_token: creds.refreshToken});
  return getGoogle().gmail({version: "v1", auth: oauth2Client});
}

/**
 * Démarre un watch Pub/Sub sur la boîte INBOX.
 * IMPORTANT : doit être renouvelé tous les 7 jours max (cron quotidien recommandé).
 * @param {import("googleapis").gmail_v1.Gmail} gmail
 * @param {string} topicName Format: projects/{projectId}/topics/{topic}
 * @return {Promise<{historyId: string, expiration: string}>}
 */
async function startWatch(gmail, topicName) {
  const res = await gmail.users.watch({
    userId: "me",
    requestBody: {
      topicName,
      labelIds: ["INBOX"],
    },
  });
  return res.data;
}

/**
 * Liste les changements (nouveaux messages) depuis un historyId donné.
 * @param {import("googleapis").gmail_v1.Gmail} gmail
 * @param {string} startHistoryId
 * @return {Promise<Array>}
 */
async function listHistory(gmail, startHistoryId) {
  const res = await withGmailBackoff(() =>
    gmail.users.history.list({
      userId: "me",
      startHistoryId,
      historyTypes: ["messageAdded"],
    }),
  );
  return res.data.history || [];
}

/**
 * Déplace un message Gmail vers la corbeille (récupérable 30 jours).
 * Requiert scope gmail.modify minimum.
 *
 * @param {import("googleapis").gmail_v1.Gmail} gmail
 * @param {string} gmailId ID Gmail du message (PAS l'ID Firestore)
 * @return {Promise<{labelIds: string[]}>} labelIds après l'opération
 */
async function trashMessage(gmail, gmailId) {
  const res = await gmail.users.messages.trash({
    userId: "me",
    id: gmailId,
  });
  return {labelIds: res.data.labelIds || []};
}

/**
 * Ajoute et/ou retire des labels sur un message Gmail.
 * Requiert scope gmail.modify minimum.
 *
 * @param {import("googleapis").gmail_v1.Gmail} gmail
 * @param {string} gmailId ID Gmail du message
 * @param {{add?: string[], remove?: string[]}} labels
 * @return {Promise<{labelIds: string[]}>} labelIds après l'opération
 */
async function modifyLabels(gmail, gmailId, {add = [], remove = []} = {}) {
  const res = await gmail.users.messages.modify({
    userId: "me",
    id: gmailId,
    requestBody: {
      addLabelIds: add,
      removeLabelIds: remove,
    },
  });
  return {labelIds: res.data.labelIds || []};
}

/**
 * Cherche un label custom Gmail par son nom. Si absent, le crée.
 * Les labels Gmail "système" (INBOX, SPAM, TRASH, UNREAD, etc.) ont déjà
 * un id en majuscules égal à leur nom — pas besoin de passer par ici pour eux.
 *
 * Cache module-level pour éviter de re-lister à chaque appel d'une même
 * invocation Cloud Function (les invocations sont stateless donc le cache
 * disparaît entre invocations — c'est OK pour Google qui ne pénalise pas
 * `labels.list`).
 *
 * @param {import("googleapis").gmail_v1.Gmail} gmail
 * @param {string} labelName Nom visible dans Gmail (ex: "Opportunité Trendl")
 * @return {Promise<string>} L'id Gmail du label
 */
async function getOrCreateLabel(gmail, labelName) {
  const listRes = await gmail.users.labels.list({userId: "me"});
  const found = (listRes.data.labels || []).find((l) => l.name === labelName);
  if (found) return found.id;

  const createRes = await gmail.users.labels.create({
    userId: "me",
    requestBody: {
      name: labelName,
      labelListVisibility: "labelShow",
      messageListVisibility: "show",
    },
  });
  return createRes.data.id;
}

/**
 * Sprint 26 PR4 — Envoie un mail via l'API Gmail.
 * Requiert scope gmail.send (cf initOAuth.js élargi PR4).
 *
 * Le body est un RFC 2822 message base64url-encodé. On gère l'encodage
 * MIME ici pour l'appelant (subject/to/from/threadId/inReplyTo).
 *
 * @param {import("googleapis").gmail_v1.Gmail} gmail
 * @param {{
 *   from: string,
 *   to: string,
 *   cc?: string,
 *   bcc?: string,
 *   subject: string,
 *   bodyText: string,
 *   threadId?: string,
 *   inReplyTo?: string,
 *   references?: string,
 * }} payload
 * @return {Promise<{id: string, threadId: string, labelIds: string[]}>}
 */
async function sendMessage(gmail, payload) {
  const raw = buildRawEmail(payload);
  const res = await gmail.users.messages.send({
    userId: "me",
    requestBody: {
      raw,
      threadId: payload.threadId,
    },
  });
  return {
    id: res.data.id,
    threadId: res.data.threadId,
    labelIds: res.data.labelIds || [],
  };
}

/**
 * Sprint 26 PR4 — Crée un brouillon Gmail (pas d'envoi).
 * Requiert scope gmail.modify.
 *
 * @param {import("googleapis").gmail_v1.Gmail} gmail
 * @param {object} payload Même schéma que sendMessage
 * @return {Promise<{id: string, messageId: string}>}
 */
async function createDraft(gmail, payload) {
  const raw = buildRawEmail(payload);
  const res = await gmail.users.drafts.create({
    userId: "me",
    requestBody: {
      message: {
        raw,
        threadId: payload.threadId,
      },
    },
  });
  return {
    id: res.data.id,
    messageId: res.data.message?.id || null,
  };
}

/**
 * Sprint 26 PR4 — Construit un email RFC 2822 base64url-encodé.
 * Gère les caractères Unicode dans subject (encoded-word UTF-8) et le
 * threading via In-Reply-To + References headers.
 *
 * Sprint 74 (recette délivrabilité 15/07) — support HTML optionnel : si
 * `bodyHtml` est fourni, le message part en multipart/alternative
 * (texte + HTML). Constat de recette : un email texte brut avec une URL nue
 * envoyé d'une adresse personnelle est jeté par les anti-spam de boîtes pro
 * (OVH/Zimbra), alors que le même contenu au format HTML professionnel
 * passe (l'email natif Firebase, HTML, arrive sans encombre). Sans
 * `bodyHtml`, comportement historique inchangé (texte seul).
 *
 * Sprint 88 (retour Max n°3 du 29/07) — PIÈCES JOINTES optionnelles. Si
 * `payload.attachments` est fourni, l'email devient un multipart/mixed : une
 * première partie « contenu » (le texte, ou le couple texte + HTML), puis une
 * partie par fichier encodée en base64. Sans pièce jointe, le message produit
 * est strictement identique à avant — aucune régression sur les envois
 * existants.
 *
 * Métaphore : jusqu'ici on glissait une feuille dans l'enveloppe ; on prend
 * désormais une enveloppe à soufflet dès qu'il y a des documents à joindre.
 *
 * @param {object} payload
 * @param {Array<{filename: string, mimeType: string, contentBase64: string}>}
 *   [payload.attachments]
 * @return {string} Base64url-encoded RFC 2822 message
 */
function buildRawEmail(payload) {
  const headers = [
    `From: ${payload.from}`,
    `To: ${payload.to}`,
  ];
  // Sprint 86 (reunion cutover 24/07) — Cc optionnel : Max met souvent le
  // createur en copie. Ajoute seulement si une adresse est fournie.
  if (payload.cc) {
    headers.push(`Cc: ${payload.cc}`);
  }
  // Sprint 86 — Bcc optionnel (copie cachée). Non visible des autres
  // destinataires ; utile pour s'auto-archiver ou garder un tiers informé.
  if (payload.bcc) {
    headers.push(`Bcc: ${payload.bcc}`);
  }
  headers.push(
    `Subject: ${encodeSubject(payload.subject || "")}`,
    "MIME-Version: 1.0",
  );
  // Sprint 103 (post 1) — Reply-To : les réponses de la marque reviennent
  // sur l'alias du créateur. Une seule adresse, sans retour à la ligne.
  if (payload.replyTo && !/[\r\n]/.test(payload.replyTo)) {
    headers.push(`Reply-To: ${payload.replyTo}`);
  }
  if (payload.inReplyTo) {
    headers.push(`In-Reply-To: ${payload.inReplyTo}`);
  }
  if (payload.references) {
    headers.push(`References: ${payload.references}`);
  }
  // Sprint 102 — e-mail automatique de Trendl (notification au créateur,
  // sécurité…) : marqué pour que le CRM ne le prenne jamais pour une
  // demande commerciale quand il relit la boîte, et pour que les boîtes
  // des destinataires n'y répondent pas automatiquement (RFC 3834).
  if (payload.autoNotification) {
    headers.push("X-App-Notification: 1", "Auto-Submitted: auto-generated");
  }

  // Partie « contenu » du message, indépendamment des pièces jointes : soit du
  // texte seul, soit un multipart/alternative texte + HTML.
  const content = buildContentSection(payload);
  const attachments = Array.isArray(payload.attachments) ?
    payload.attachments.filter((a) => a && a.contentBase64) :
    [];

  let message;
  if (attachments.length === 0) {
    headers.push(...content.headers);
    message = headers.join("\r\n") + "\r\n\r\n" + content.body;
  } else {
    // Sprint 88 — enveloppe à soufflet : contenu + un bloc par fichier.
    const mixed = "=_qmix_" + Date.now().toString(36);
    headers.push(`Content-Type: multipart/mixed; boundary="${mixed}"`);
    const parts = [
      `--${mixed}`,
      ...content.headers,
      "",
      content.body,
      ...attachments.map((a) => buildAttachmentPart(mixed, a)),
      `--${mixed}--`,
    ];
    message = headers.join("\r\n") + "\r\n\r\n" + parts.join("\r\n");
  }

  return Buffer.from(message, "utf8")
    .toString("base64")
    .replace(/\+/g, "-")
    .replace(/\//g, "_")
    .replace(/=+$/, "");
}

/**
 * Sprint 88 — Partie « contenu » d'un email : texte seul, ou multipart/
 * alternative (texte + HTML) quand `bodyHtml` est fourni. Extrait de
 * buildRawEmail pour pouvoir l'imbriquer dans un multipart/mixed quand il y a
 * des pièces jointes. PUR.
 *
 * @param {object} payload
 * @return {{headers: string[], body: string}}
 */
function buildContentSection(payload) {
  if (payload.bodyHtml) {
    // Multipart/alternative : le lecteur mail choisit la meilleure version
    // (HTML), la version texte reste le repli universel.
    const boundary = "=_q_" + Date.now().toString(36);
    return {
      headers: [`Content-Type: multipart/alternative; boundary="${boundary}"`],
      body: [
        `--${boundary}`,
        "Content-Type: text/plain; charset=\"UTF-8\"",
        "",
        payload.bodyText || "",
        `--${boundary}`,
        "Content-Type: text/html; charset=\"UTF-8\"",
        "",
        payload.bodyHtml,
        `--${boundary}--`,
      ].join("\r\n"),
    };
  }
  return {
    headers: ["Content-Type: text/plain; charset=\"UTF-8\""],
    body: payload.bodyText || "",
  };
}

/**
 * Sprint 88 — Nettoie un nom de fichier pour un header MIME : on retire les
 * guillemets et les sauts de ligne (injection d'en-tête), et on encode le nom
 * s'il contient des accents. PUR.
 *
 * @param {string} filename
 * @return {string}
 */
function sanitizeAttachmentName(filename) {
  const clean = String(filename || "piece-jointe")
      .replace(/[\r\n"]/g, " ")
      // Les blancs consécutifs (dont ceux nés du nettoyage) sont fondus en un
      // seul : un nom de fichier propre, et un header MIME sans surprise.
      .replace(/\s+/g, " ")
      .trim()
      .slice(0, 200);
  return encodeSubject(clean || "piece-jointe");
}

/**
 * Sprint 88 — Découpe une chaîne base64 en lignes de 76 caractères, comme
 * l'exige le format MIME (les serveurs rejettent les lignes trop longues). PUR.
 *
 * @param {string} base64
 * @return {string}
 */
function wrapBase64(base64) {
  const raw = String(base64 || "").replace(/\s+/g, "");
  const lines = [];
  for (let i = 0; i < raw.length; i += 76) {
    lines.push(raw.slice(i, i + 76));
  }
  return lines.join("\r\n");
}

/**
 * Sprint 88 — Construit le bloc MIME d'une pièce jointe. PUR.
 *
 * @param {string} boundary séparateur du multipart/mixed
 * @param {{filename: string, mimeType: string, contentBase64: string}} att
 * @return {string}
 */
function buildAttachmentPart(boundary, att) {
  const name = sanitizeAttachmentName(att.filename);
  return [
    `--${boundary}`,
    `Content-Type: ${att.mimeType || "application/octet-stream"}; name="${name}"`,
    `Content-Disposition: attachment; filename="${name}"`,
    "Content-Transfer-Encoding: base64",
    "",
    wrapBase64(att.contentBase64),
  ].join("\r\n");
}

/**
 * Encode un subject en MIME encoded-word UTF-8 si nécessaire (caractères
 * non-ASCII). Sinon retourne tel quel.
 */
function encodeSubject(subject) {
   
  if (/^[\x00-\x7F]*$/.test(subject)) return subject;
  const encoded = Buffer.from(subject, "utf8").toString("base64");
  return `=?UTF-8?B?${encoded}?=`;
}

module.exports = {
  createOAuthClient,
  createGmailClient,
  // Sprint 82 (B157) — résolution per-user via le compte exploitant.
  createGmailClientAuto,
  startWatch,
  listHistory,
  trashMessage,
  modifyLabels,
  getOrCreateLabel,
  sendMessage,
  createDraft,
  buildRawEmail,
  encodeSubject,
  // Sprint 88 — pièces jointes (exposés pour les tests unitaires).
  buildContentSection,
  buildAttachmentPart,
  sanitizeAttachmentName,
  wrapBase64,
  // Sprint 68 (M04-R6) — backoff quota Gmail (exposé pour réutilisation + tests).
  withGmailBackoff,
  parseRetryAfterMs,
  isRateLimitError,
};
