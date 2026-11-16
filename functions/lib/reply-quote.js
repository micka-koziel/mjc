/**
 * Historique cité sous les réponses — Sprint 103 (posts 4 et 9 de l'équipe
 * Trendl, 22/10 : « les e-mails qu'on envoie n'ont pas d'historique… c'est
 * un vrai frein pour la gestion de nos négos »).
 *
 * Comme Gmail ou Outlook quand on clique « Répondre » : sous le texte de la
 * réponse, on recopie le DERNIER message du fil, précédé de
 * « Le 20 oct. 2026 à 14:03, Sachin <s@marque.com> a écrit : ». Ce dernier
 * message contient lui-même, le plus souvent, les échanges précédents : on
 * ne recopie donc pas tout le fil (même choix que Gmail).
 *
 * - texte brut : lignes préfixées par « > » ;
 * - HTML : bloc `gmail_quote`, que Gmail replie derrière ses « … ».
 * Les en-têtes In-Reply-To / References rangent la réponse dans la bonne
 * conversation chez le destinataire, y compris sous Outlook.
 *
 * Sprint 104 (post 5, Trendl 29/10 : « tous les anciens messages ne sont pas
 * mis quand on répond… il faudrait tous les mettre ») — le dernier message
 * ne contient PAS toujours les précédents (messages envoyés par le CRM avant
 * le Sprint 103, clients mail qui ne citent pas). On cite désormais TOUT le
 * fil, du plus récent au plus ancien, chaque message débarrassé de sa
 * propre citation (sinon tout serait en double), emboîté comme dans Gmail
 * (qui replie le tout derrière ses « … »). Seuls les échanges avec
 * l'interlocuteur externe sont cités (filtre fait par l'appelant).
 *
 * Module PUR (sauf fetchThreadingHeaders, une lecture Gmail bornée).
 */

const {escapeHtml, textToSimpleHtml} = require("./email-html");

const MAX_QUOTED_CHARS = 20000;
const MAX_QUOTED_MESSAGES = 15;
// Début de la citation d'un message (on coupe à partir de là) : « Le …, X a
// écrit : », « On …, X wrote: », bloc Outlook « De : … Envoyé : … », « -----
// Original Message ----- », ou première ligne « > ».
const QUOTE_START = [
  /^[ \t]*Le\s[^\n]{4,160}\n?[^\n]{0,80}\sa\s+[ée]crit\s*:[ \t]*$/im,
  /^[ \t]*On\s[^\n]{4,160}\n?[^\n]{0,80}\swrote:[ \t]*$/im,
  /^[ \t]*-{2,}\s*(Original Message|Message d'origine|Forwarded message|Message transf[ée]r[ée])\s*-{2,}\s*$/im,
  /^[ \t]*(De|From)\s*:\s.+\n\s*(Envoy[ée]|Sent|Date)\s*:\s/im,
  /^[ \t]*>.*$/m,
];
const FR_HINT = /\b(bonjour|merci|cordialement|nous|vous|votre|bien à vous|bonne journée)\b/i;

const MONTHS_FR = ["janv.", "févr.", "mars", "avr.", "mai", "juin", "juil.", "août", "sept.", "oct.", "nov.", "déc."];
const MONTHS_EN = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];

/**
 * Langue de l'attribution (« a écrit » / « wrote »), devinée sur la réponse.
 * @param {string} replyText
 * @return {"fr"|"en"}
 */
function guessLang(replyText) {
  return FR_HINT.test(String(replyText || "")) ? "fr" : "en";
}

/**
 * Date lisible à l'heure de Paris (l'équipe Trendl y est).
 * @param {number} ms
 * @param {"fr"|"en"} lang
 * @return {string}
 */
function formatQuoteDate(ms, lang) {
  if (!Number.isFinite(ms)) return "";
  // Décalage Paris (heure d'été / d'hiver) via Intl, sans dépendance.
  const parts = Object.fromEntries(new Intl.DateTimeFormat("en-GB", {
    timeZone: "Europe/Paris", year: "numeric", month: "numeric", day: "numeric",
    hour: "2-digit", minute: "2-digit", weekday: "short", hour12: false,
  }).formatToParts(new Date(ms)).map((p) => [p.type, p.value]));
  const month = Number(parts.month) - 1;
  if (lang === "fr") {
    return `${Number(parts.day)} ${MONTHS_FR[month]} ${parts.year} à ${parts.hour}:${parts.minute}`;
  }
  return `${parts.weekday}, ${MONTHS_EN[month]} ${Number(parts.day)}, ${parts.year} at ${parts.hour}:${parts.minute}`;
}

/**
 * Ligne d'attribution : « Le …, X a écrit : » / « On …, X wrote: ».
 * @param {{from?: string, atMs?: number}} quoted
 * @param {"fr"|"en"} lang
 * @return {string}
 */
function attributionLine(quoted, lang) {
  const who = String(quoted.from || "").replace(/[\r\n]/g, " ").trim() || (lang === "fr" ? "Votre correspondant" : "Your contact");
  const when = formatQuoteDate(quoted.atMs, lang);
  if (lang === "fr") return when ? `Le ${when}, ${who} a écrit :` : `${who} a écrit :`;
  return when ? `On ${when}, ${who} wrote:` : `${who} wrote:`;
}

/**
 * Texte du message cité, borné.
 * @param {string} text
 * @return {string}
 */
function quotedBody(text) {
  const t = String(text || "").replace(/\r\n/g, "\n").replace(/\s+$/, "");
  if (t.length <= MAX_QUOTED_CHARS) return t;
  return `${t.slice(0, MAX_QUOTED_CHARS)}\n[…]`;
}

/**
 * Le message à citer, depuis un fil trié du plus ancien au plus récent :
 * le dernier message qui a un contenu. null si rien à citer.
 * @param {Array<object>} thread messages {from, bodyText, snippet, receivedAt…}
 * @param {function} toMillis convertisseur de date
 * @return {{from: string, atMs: number|null, text: string, gmailId: string|null}|null}
 */
function pickQuotedMessage(thread = [], toMillis = () => null) {
  const list = Array.isArray(thread) ? thread : [];
  for (let i = list.length - 1; i >= 0; i -= 1) {
    const m = list[i] || {};
    const text = m.bodyText || m.snippet || "";
    if (!String(text).trim()) continue;
    return {
      from: m.from || "",
      atMs: toMillis(m.receivedAt) || null,
      text,
      gmailId: m.id || m.gmailId || null,
    };
  }
  return null;
}

/**
 * Sprint 104 — texte propre d'un message : sans sa propre citation (tout ce
 * qui suit « Le …, X a écrit : », un bloc « De : … Envoyé : … », etc.).
 * PUR.
 * @param {string} text
 * @return {string}
 */
function stripQuotedTail(text) {
  const t = String(text || "").replace(/\r\n/g, "\n");
  let cut = t.length;
  for (const re of QUOTE_START) {
    const m = re.exec(t);
    if (m && m.index > 0 && m.index < cut) cut = m.index;
  }
  return t.slice(0, cut).replace(/\s+$/, "");
}

/**
 * Sprint 104 (post 5) — TOUT le fil à citer, du plus récent au plus ancien,
 * depuis un fil trié du plus ancien au plus récent. Chaque message est
 * débarrassé de sa propre citation. [] si rien à citer.
 * @param {Array<object>} thread
 * @param {function} toMillis
 * @param {{max?: number}} [opts]
 * @return {Array<{from: string, atMs: number|null, text: string, gmailId: string|null}>}
 */
function pickQuotedThread(thread = [], toMillis = () => null, {max = MAX_QUOTED_MESSAGES} = {}) {
  const list = Array.isArray(thread) ? thread : [];
  const out = [];
  const seen = new Set();
  for (let i = list.length - 1; i >= 0 && out.length < max; i -= 1) {
    const m = list[i] || {};
    const raw = m.bodyText || m.snippet || "";
    const text = stripQuotedTail(raw) || String(raw).trim();
    if (!String(text).trim()) continue;
    const key = `${m.from || ""}|${text.slice(0, 200)}`;
    if (seen.has(key)) continue; // copie identique (envoi en double)
    seen.add(key);
    out.push({from: m.from || "", atMs: toMillis(m.receivedAt) || null, text, gmailId: m.id || m.gmailId || null});
  }
  return out;
}

/**
 * Sprint 104 — garde les messages échangés AVEC l'interlocuteur externe
 * (de lui, ou adressés à lui), jamais un échange interne du même fil. PUR.
 * @param {Array<object>} thread
 * @param {string} counterpart adresse de l'interlocuteur
 * @return {Array<object>}
 */
function exchangesWith(thread = [], counterpart = "") {
  const who = bare(counterpart);
  if (!who) return thread || [];
  return (thread || []).filter((m) => {
    if (bare(m.from) === who) return true;
    const dest = [].concat(m.to || [], m.cc || [], m.bcc || []).flatMap((x) => String(x).split(","));
    return dest.some((d) => bare(d) === who);
  });
}

/**
 * Adresse e-mail nue, en minuscules.
 * @param {string} s
 * @return {string}
 */
function bare(s) {
  const m = String(s || "").match(/[^\s<>"',;]+@[^\s<>"',;]+/);
  return m ? m[0].toLowerCase() : "";
}

/**
 * Ajoute l'historique cité à un payload d'envoi (texte + HTML). Ne modifie
 * pas l'entrée. Sans message à citer, renvoie le payload avec sa version
 * HTML simple habituelle.
 * @param {object} payload {bodyText, …}
 * @param {{from?: string, atMs?: number, text: string}|null} quoted
 * @param {{lang?: "fr"|"en"}} [opts]
 * @return {object}
 */
function withQuotedHistory(payload, quoted, opts = {}) {
  // Sprint 104 — une LISTE de messages (tout le fil) est citée emboîtée.
  if (Array.isArray(quoted)) {
    if (quoted.length > 1) return withQuotedThread(payload, quoted, opts);
    return withQuotedHistory(payload, quoted[0] || null, opts);
  }
  const base = {...(payload || {})};
  const reply = String(base.bodyText || "");
  const body = quoted ? quotedBody(quoted.text) : "";
  if (!quoted || !body.trim()) {
    return base.bodyHtml || !reply.trim() ? base : {...base, bodyHtml: textToSimpleHtml(reply)};
  }
  const lang = opts.lang || guessLang(reply);
  const attribution = attributionLine(quoted, lang);
  const quotedText = body.split("\n").map((l) => (l ? `> ${l}` : ">")).join("\n");
  const html = [
    textToSimpleHtml(reply),
    "<br />",
    '<div class="gmail_quote">',
    `<div class="gmail_attr" style="font-family:Arial,Helvetica,sans-serif;font-size:13px;color:#5f6368;">${escapeHtml(attribution)}</div>`,
    '<blockquote class="gmail_quote" style="margin:0 0 0 .8ex;border-left:1px solid #ccc;padding-left:1ex;color:#5f6368;font-family:Arial,Helvetica,sans-serif;font-size:13px;">',
    escapeHtml(body).split("\n").join("<br />"),
    "</blockquote>",
    "</div>",
  ].join("");
  return {
    ...base,
    bodyText: `${reply.replace(/\s+$/, "")}\n\n${attribution}\n${quotedText}\n`,
    bodyHtml: html,
  };
}

/**
 * Sprint 104 (post 5) — tout le fil cité, emboîté : sous la réponse, le
 * message le plus récent, qui « contient » le précédent, et ainsi de suite
 * (rendu identique à une longue conversation Gmail). Borné à
 * MAX_QUOTED_CHARS au total. PUR.
 * @param {object} payload
 * @param {Array<{from?: string, atMs?: number, text: string}>} list du plus
 *   récent au plus ancien
 * @param {{lang?: "fr"|"en"}} [opts]
 * @return {object}
 */
function withQuotedThread(payload, list, opts = {}) {
  const base = {...(payload || {})};
  const reply = String(base.bodyText || "");
  const lang = opts.lang || guessLang(reply);
  let budget = MAX_QUOTED_CHARS;
  const items = [];
  for (const q of list) {
    const t = String(q.text || "").replace(/\r\n/g, "\n").replace(/\s+$/, "");
    if (!t.trim() || budget <= 0) continue;
    const body = t.length > budget ? `${t.slice(0, budget)}\n[…]` : t;
    budget -= body.length;
    items.push({attribution: attributionLine(q, lang), body});
  }
  if (!items.length) return withQuotedHistory(payload, null, opts);

  // Texte : chaque niveau ajoute un « > ».
  const textParts = items.map((it, depth) => {
    const prefix = ">".repeat(depth);
    const pre = (l) => (prefix ? `${prefix} ${l}`.replace(/ $/, "") : l);
    const quote = ">".repeat(depth + 1);
    const lines = it.body.split("\n").map((l) => (l ? `${quote} ${l}` : quote));
    return [pre(it.attribution), ...lines].join("\n");
  });
  const bodyText = `${reply.replace(/\s+$/, "")}\n\n${textParts.join(`\n${">"}\n`)}\n`;

  // HTML : blocs emboîtés (Gmail replie le tout derrière « … »).
  const ATTR = 'class="gmail_attr" style="font-family:Arial,Helvetica,sans-serif;font-size:13px;color:#5f6368;"';
  const BQ = 'class="gmail_quote" style="margin:0 0 0 .8ex;border-left:1px solid #ccc;padding-left:1ex;color:#5f6368;font-family:Arial,Helvetica,sans-serif;font-size:13px;"';
  let inner = "";
  for (let i = items.length - 1; i >= 0; i -= 1) {
    const it = items[i];
    inner = [
      `<div ${ATTR}>${escapeHtml(it.attribution)}</div>`,
      `<blockquote ${BQ}>`,
      escapeHtml(it.body).split("\n").join("<br />"),
      inner ? `<br /><br />${inner}` : "",
      "</blockquote>",
    ].join("");
  }
  const bodyHtml = [textToSimpleHtml(reply), "<br />", '<div class="gmail_quote">', inner, "</div>"].join("");
  return {...base, bodyText, bodyHtml};
}

/**
 * En-têtes de conversation (Message-ID / References) du message cité, lus
 * dans Gmail (une lecture « metadata », légère). Best-effort : {} en cas
 * d'échec, l'envoi part quand même (le fil Gmail suffit côté Trendl).
 * @param {object} gmail client googleapis
 * @param {string|null} gmailId
 * @return {Promise<{inReplyTo?: string, references?: string}>}
 */
async function fetchThreadingHeaders(gmail, gmailId) {
  if (!gmail || !gmailId) return {};
  try {
    const res = await gmail.users.messages.get({
      userId: "me",
      id: gmailId,
      format: "metadata",
      metadataHeaders: ["Message-ID", "References"],
    });
    const headers = {};
    for (const h of (res && res.data && res.data.payload && res.data.payload.headers) || []) {
      headers[String(h.name).toLowerCase()] = h.value;
    }
    return threadingFrom(headers["message-id"], headers["references"]);
  } catch {
    return {};
  }
}

/**
 * In-Reply-To / References à partir des en-têtes du message cité. PUR.
 * @param {string} messageId
 * @param {string} references
 * @return {{inReplyTo?: string, references?: string}}
 */
function threadingFrom(messageId, references) {
  const id = String(messageId || "").replace(/[\r\n]/g, "").trim();
  if (!/^<[^<>\s]+>$/.test(id)) return {};
  const prev = String(references || "").replace(/[\r\n]+/g, " ").trim()
      .split(/\s+/).filter((r) => /^<[^<>\s]+>$/.test(r)).slice(-20);
  return {inReplyTo: id, references: [...prev, id].join(" ")};
}

module.exports = {
  MAX_QUOTED_CHARS,
  MAX_QUOTED_MESSAGES,
  stripQuotedTail,
  pickQuotedThread,
  exchangesWith,
  withQuotedThread,
  guessLang,
  formatQuoteDate,
  attributionLine,
  pickQuotedMessage,
  withQuotedHistory,
  fetchThreadingHeaders,
  threadingFrom,
};
