/**
 * IA SIMULÉE du mode démo — aucun appel à un service d'IA.
 *
 * Les textes sont construits à partir des données fictives déjà présentes
 * (analyse de chaque message, expéditeur, action attendue) et des préférences
 * d'assistant de la configuration (ton, concision, langue). Chaque sortie est
 * marquée `simulated: true` pour que l'interface puisse l'indiquer.
 *
 * Module PUR (testable) : aucune I/O, l'horloge est injectée.
 */

import { displayName, parseEmailAddress } from '@/features/mailbox/lib/format-email';
import { directionOf } from '@/features/mailbox/lib/threads';
import { toMs } from '@/shared/utils/format-date';

const fmtDay = (ms, lang) =>
  new Intl.DateTimeFormat(lang === 'en' ? 'en-GB' : 'fr-FR', { day: 'numeric', month: 'long' }).format(ms);

/**
 * Résumé d'un fil : ce qui s'est passé, points utiles, situation actuelle.
 * Ne travaille que sur les messages fournis : rien n'est inventé.
 */
export function simulateThreadSummary(messages = [], { lang = 'fr' } = {}) {
  const sorted = [...messages].sort((a, b) => (toMs(a.receivedAt) || 0) - (toMs(b.receivedAt) || 0));
  if (sorted.length === 0) {
    return { summary: 'Aucun message disponible dans ce fil.', keyPoints: [], status: '', simulated: true };
  }
  const inbound = sorted.filter((m) => directionOf(m) === 'inbound');
  const counterpart = inbound[inbound.length - 1] || sorted[0];
  const who = counterpart.analysis?.senderName || displayName(counterpart.from) || 'votre correspondant';
  const company = counterpart.analysis?.senderCompany;
  const last = sorted[sorted.length - 1];
  const lastInbound = directionOf(last) === 'inbound';

  const intro =
    sorted.length === 1
      ? `${who}${company ? `, de ${company},` : ''} vous a écrit le ${fmtDay(toMs(last.receivedAt), lang)}.`
      : `Échange de ${sorted.length} messages avec ${who}${company ? ` (${company})` : ''}, du ${fmtDay(
          toMs(sorted[0].receivedAt),
          lang
        )} au ${fmtDay(toMs(last.receivedAt), lang)}.`;

  const keyPoints = sorted
    .map((m) => m.analysis?.summary1Line)
    .filter(Boolean)
    .slice(-4);

  const status = lastInbound
    ? `En attente de votre réponse${last.analysis?.expectedAction ? ` : ${lowerFirst(last.analysis.expectedAction)}` : ''}.`
    : `Vous avez répondu en dernier, le ${fmtDay(toMs(last.receivedAt), lang)} : en attente de leur retour.`;

  return { summary: intro, keyPoints, status, simulated: true };
}

function lowerFirst(s) {
  return s ? s.charAt(0).toLowerCase() + s.slice(1) : s;
}

const GREET = {
  fr: { cordial: (n) => `Bonjour ${n},`, professional: (n) => `Bonjour ${n},`, direct: (n) => `Bonjour ${n},` },
  en: { cordial: (n) => `Hello ${n},`, professional: (n) => `Dear ${n},`, direct: (n) => `Hi ${n},` },
};
const CLOSE = {
  fr: { cordial: 'Belle journée,', professional: 'Je vous prie d’agréer mes salutations distinguées,', direct: 'Cordialement,' },
  en: { cordial: 'Have a great day,', professional: 'Kind regards,', direct: 'Best,' },
};

/** Corps de réponse selon l'action attendue (démo : quelques cas connus). */
function bodyFor(action = '', lang) {
  const a = action.toLowerCase();
  if (lang === 'en') {
    if (a.includes('quantit') || a.includes('livraison')) return ['I confirm the updated quantity.', 'Delivery can take place on the date agreed together; I will send you the exact slot shortly.'];
    if (a.includes('devis')) return ['Thank you for your request.', 'I am preparing the quote and will send it to you before Friday.'];
    if (a.includes('remplacement')) return ['I am sorry about the damaged parcel.', 'We will ship a replacement at no cost as soon as possible.'];
    if (a.includes('rendez-vous') || a.includes('créneau')) return ['Thank you for your message.', 'Thursday at 10 am would suit me. Does that work for you?'];
    return ['Thank you for your message.', 'I will get back to you shortly with a complete answer.'];
  }
  if (a.includes('quantit') || a.includes('livraison')) {
    return [
      'Je vous confirme bien la nouvelle quantité de 150 coffrets.',
      'La livraison pourra avoir lieu la semaine du 8 décembre ; je vous transmets le créneau exact dès qu’il est fixé avec notre transporteur.',
    ];
  }
  if (a.includes('devis')) return ['Merci pour votre demande.', 'Je prépare le devis à partir de votre cahier des charges et vous l’adresse avant vendredi.'];
  if (a.includes('remplacement')) return ['Je suis désolée pour ce colis abîmé.', 'Nous vous renvoyons les deux produits concernés sans frais, dès que possible.'];
  if (a.includes('rendez-vous') || a.includes('créneau')) return ['Merci pour votre message.', 'Jeudi à 10 h me conviendrait. Ce créneau vous convient-il ?'];
  if (a.includes('candidature')) return ['Merci pour votre candidature.', 'Nous l’étudions avec attention et revenons vers vous rapidement.'];
  if (a.includes('palette')) return ['Je vous confirme 3 palettes.', 'Merci de me préciser l’horaire exact d’enlèvement.'];
  return ['Merci pour votre message.', 'Je reviens vers vous rapidement avec une réponse complète.'];
}

/**
 * Brouillon de réponse simulé.
 * @param {object} message mail auquel on répond
 * @param {{instruction?: string, assistant?: object, senderName?: string}} opts
 */
export function simulateReplyDraft(message, { instruction = '', assistant = {}, senderName = '' } = {}) {
  const instr = String(instruction || '').toLowerCase();
  let lang = assistant.language === 'en' ? 'en' : 'fr';
  if (/anglais|english/.test(instr)) lang = 'en';
  if (/français|french/.test(instr)) lang = 'fr';
  let tone = assistant.tone || 'cordial';
  if (/formel|professionnel/.test(instr)) tone = 'professional';
  if (/direct|sec/.test(instr)) tone = 'direct';
  let concision = assistant.concision || 'balanced';
  if (/court|bref|concis/.test(instr)) concision = 'short';
  if (/détaill|long/.test(instr)) concision = 'detailed';

  const firstName = (message.analysis?.senderName || displayName(message.from) || '').split(' ')[0] || '';
  const lines = bodyFor(message.analysis?.expectedAction || '', lang);
  const body = concision === 'short' ? [lines[lines.length - 1]] : [...lines];
  if (concision === 'detailed') {
    body.push(lang === 'en' ? 'Do not hesitate to contact me if you need any further information.' : 'N’hésitez pas à me contacter si vous avez besoin de précisions.');
  }
  if (instr && !/court|bref|concis|détaill|long|formel|professionnel|direct|anglais|english|français|french/.test(instr)) {
    body.push(lang === 'en' ? `(Instruction taken into account: « ${instruction.trim()} ».)` : `(Consigne prise en compte : « ${instruction.trim()} ».)`);
  }
  const draft = [
    GREET[lang][tone](firstName),
    '',
    body.join(concision === 'short' ? ' ' : '\n\n'),
    '',
    CLOSE[lang][tone],
    senderName || '',
  ]
    .join('\n')
    .trim();

  const subject = String(message.subject || '').trim();
  return {
    draft_text: draft,
    subject_proposed: /^re\s*:/i.test(subject) ? subject : `Re: ${subject || '(sans objet)'}`,
    recipient: parseEmailAddress(message.reply_to || message.from)?.email || message.from || '',
    confidence: 0.8,
    kind: directionOf(message) === 'outbound' ? 'relance' : 'reply',
    simulated: true,
  };
}

/** Résumé des N dernières heures (même forme que summarizeRecentEmails). */
export function simulateRecentSummary(messages = [], { hours = 12, now = Date.now() } = {}) {
  const since = now - hours * 3600 * 1000;
  const items = messages
    .filter((m) => Array.isArray(m.labels) && m.labels.includes('INBOX') && !m.triaged_at)
    .filter((m) => (toMs(m.receivedAt) || 0) >= since)
    .sort((a, b) => toMs(b.receivedAt) - toMs(a.receivedAt))
    .map((m) => ({
      id: m.id,
      threadId: m.threadId,
      from: m.from,
      subject: m.subject,
      snippet: m.analysis?.summary1Line || m.snippet,
      expectedAction: m.analysis?.expectedAction || null,
    }));
  const toDo = items.filter((i) => i.expectedAction);
  const summary_text =
    items.length === 0
      ? ''
      : `${items.length} e-mail${items.length > 1 ? 's' : ''} reçu${items.length > 1 ? 's' : ''} en ${hours} h, dont ${toDo.length} demandant une action. ` +
        (toDo[0] ? `Le plus récent à traiter : ${toDo[0].snippet}` : 'Rien d’urgent.');
  return { summary_text, items, simulated: true };
}
