'use client';

import { useEffect, useRef, useState } from 'react';
import { Button } from '@/shared/components/Button';
import { Spinner } from '@/shared/components/Spinner';
import { useToast } from '@/shared/hooks/useToast';
import { useApp } from '@/app-shell/AppProviders';
import { brandConfig } from '@/features/brand/brand';
import { validateRecipients } from '@/features/mailbox/lib/validate-recipients';
import { resolveReplyTo, suggestReplyCc } from '@/features/mailbox/lib/resolve-reply-to';
import { DraftFactWarnings } from '@/features/mailbox/components/DraftFactWarnings';
import { isSendCancelled } from '@/shared/utils/undo-send';

/** Pièces jointes : mêmes limites que le serveur (Trendl, Sprint 88). */
export const MAX_ATTACHMENTS = 5;

/**
 * ReplyComposer — module « Réponse IA ».
 *
 * Reprise de ReplyDraftDrawer (Trendl, rendu `embedded`) avec la MÊME
 * logique : brouillon pré-généré affiché s'il existe, sinon génération ;
 * destinataires À / Cc / Cci pré-remplis (« répondre à tous » sans soi-même) ;
 * sujet ; brouillon éditable ; « Régénérer » avec consigne ; pièces jointes
 * (5 max, 10 Mo par fichier) ; envoi avec 5 s pour annuler ; alertes sur les
 * liens/adresses non vérifiés renvoyées par le serveur.
 *
 * Adaptations Quantique :
 *  - appels via la couche services (démo ou réel) au lieu des fetch directs ;
 *  - préférences d'assistant de la configuration (ton, concision, langue)
 *    transmises à la génération ;
 *  - retirés : consigne de refus d'opportunité (composeInstruction, CRM),
 *    signature par profil d'expéditeur Trendl (useSenderProfile), bouton
 *    « Pas mon style » (sans effet réel dans Trendl : simple message).
 */
export function ReplyComposer({ message, onSent }) {
  const { service, user, mode } = useApp();
  const { showToast } = useToast();
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);
  const [recipients, setRecipients] = useState('');
  const [cc, setCc] = useState('');
  const [bcc, setBcc] = useState('');
  const [subject, setSubject] = useState('');
  const [draftText, setDraftText] = useState('');
  const [confidence, setConfidence] = useState(null);
  const [factWarnings, setFactWarnings] = useState([]);
  const [draftKind, setDraftKind] = useState(null);
  const [simulated, setSimulated] = useState(false);
  const [sending, setSending] = useState(false);
  const [sentOk, setSentOk] = useState(false);
  const [attachments, setAttachments] = useState([]);
  const [uploading, setUploading] = useState(false);
  const [showInstructionInput, setShowInstructionInput] = useState(false);
  const [instruction, setInstruction] = useState('');
  const fileInputRef = useRef(null);
  const messageIdRef = useRef(null);

  const assistantPrefs = brandConfig.assistant;

  useEffect(() => {
    if (!message?.id || !service) return;
    if (messageIdRef.current === message.id) return;
    messageIdRef.current = message.id;

    setError(null);
    setSentOk(false);
    const to = resolveReplyTo(message);
    setRecipients(to);
    setCc(suggestReplyCc(message, to, [user?.email].filter(Boolean)));
    setBcc('');
    setShowInstructionInput(false);
    setInstruction('');
    setDraftKind(null);
    setAttachments([]);
    loadExistingDraft();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [message?.id, service]);

  function applyDraft(d) {
    setDraftText(d.draft_text || '');
    setSubject(d.subject_proposed || deriveDefaultSubject(message.subject));
    setConfidence(typeof d.confidence === 'number' ? d.confidence : null);
    setFactWarnings(Array.isArray(d.fact_warnings) ? d.fact_warnings : []);
    setDraftKind(d.kind === 'relance' ? 'relance' : 'reply');
    setSimulated(Boolean(d.simulated));
    if (typeof d.recipient === 'string' && d.recipient.trim()) setRecipients(d.recipient.trim());
    if (typeof d.cc_suggested === 'string') setCc((prev) => (prev.trim() ? prev : d.cc_suggested));
  }

  async function loadExistingDraft() {
    setLoading(true);
    try {
      const existing = await service.getExistingDraft(message.id);
      if (existing) {
        applyDraft(existing);
        setLoading(false);
        return;
      }
    } catch (err) {
      console.warn('Lecture du brouillon existant en échec :', err?.message);
    }
    runGenerate();
  }

  async function runGenerate(userInstruction) {
    setLoading(true);
    setError(null);
    setDraftText('');
    try {
      const data = await service.generateReplyDraft(message.id, {
        instruction: userInstruction,
        assistant: assistantPrefs,
      });
      applyDraft(data);
      setShowInstructionInput(false);
      setInstruction('');
    } catch (err) {
      setError(err.message || 'Le service IA n’a pas répondu.');
    } finally {
      setLoading(false);
    }
  }

  async function runSend() {
    if (!draftText.trim()) return showToast({ message: 'Le brouillon est vide.', variant: 'error' });
    if (!recipients.trim()) return showToast({ message: 'Indiquez au moins un destinataire.', variant: 'error' });
    for (const [label, value] of [
      ['', recipients],
      [' en copie', cc],
      [' en copie cachée', bcc],
    ]) {
      if (!value.trim()) continue;
      const { invalid } = validateRecipients(value);
      if (invalid.length) return showToast({ message: `Adresse(s)${label} invalide(s) : ${invalid.join(', ')}`, variant: 'error' });
    }
    setSending(true);
    try {
      await service.sendReply({
        messageId: message.id,
        text: draftText,
        subject,
        recipients,
        cc: cc.trim() || undefined,
        bcc: bcc.trim() || undefined,
        attachments,
      });
      // Succès affiché SEULEMENT après la confirmation du service.
      setSentOk(true);
      showToast({ message: mode === 'demo' ? 'Envoi simulé (démo) : rien n’est parti.' : 'E-mail envoyé.', variant: 'success' });
      onSent?.();
    } catch (err) {
      showToast({
        message: isSendCancelled(err) ? err.message : `Échec de l’envoi : ${err.message}. Votre texte est conservé.`,
        variant: isSendCancelled(err) ? 'info' : 'error',
      });
    } finally {
      setSending(false);
    }
  }

  async function handleFilesSelected(event) {
    const files = Array.from(event.target.files || []);
    event.target.value = '';
    if (!files.length) return;
    if (attachments.length + files.length > MAX_ATTACHMENTS) {
      showToast({ message: `${MAX_ATTACHMENTS} pièces jointes maximum par e-mail.`, variant: 'error' });
      return;
    }
    setUploading(true);
    try {
      for (const file of files) {
        const uploaded = await service.uploadAttachment(message.id, file);
        setAttachments((prev) => [...prev, uploaded]);
      }
    } catch (err) {
      showToast({ message: err.message, variant: 'error' });
    } finally {
      setUploading(false);
    }
  }

  const input =
    'h-10 w-full rounded-lg border border-border bg-background px-3 text-base text-foreground focus:border-primary focus:outline-none lg:text-sm';
  const label = 'mb-1 block text-xs font-semibold uppercase tracking-wider text-muted';

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-wrap items-center gap-2">
        <p className="text-xs font-semibold uppercase tracking-wider text-muted">
          {draftKind === 'relance' ? 'Relance suggérée' : 'Réponse suggérée'}
        </p>
        {simulated && (
          <span className="rounded-full border border-border bg-elevated px-2 py-0.5 text-[10px] font-semibold text-muted">
            IA simulée (démo)
          </span>
        )}
        {typeof confidence === 'number' && !loading && (
          <span className="text-xs text-muted">Confiance IA : {Math.round(confidence * 100)} %</span>
        )}
      </div>

      {loading && (
        <div className="flex flex-col items-center gap-3 py-8 text-sm text-muted">
          <Spinner className="h-6 w-6" />
          <p>{assistantPrefs.name} rédige une proposition de réponse…</p>
        </div>
      )}

      {error && (
        <div className="rounded-lg border border-danger/40 bg-danger/10 p-3 text-sm text-danger">
          <p className="font-semibold">Proposition indisponible</p>
          <p className="mt-1 break-words">{error}</p>
          <p className="mt-1 text-foreground">Vous pouvez réessayer, ou écrire votre réponse vous-même.</p>
          <div className="mt-3 flex gap-2">
            <Button variant="secondary" size="sm" onClick={() => runGenerate()}>
              Réessayer
            </Button>
            <Button variant="ghost" size="sm" onClick={() => setError(null)}>
              Écrire moi-même
            </Button>
          </div>
        </div>
      )}

      {!loading && !error && (
        <div className="space-y-4">
          {showInstructionInput && (
            <div className="rounded-lg border border-primary/30 bg-primary/5 p-3">
              <label htmlFor="regen-instruction" className={label}>
                Régénérer avec une consigne
              </label>
              <textarea
                id="regen-instruction"
                spellCheck
                value={instruction}
                onChange={(e) => setInstruction(e.target.value)}
                rows={3}
                autoFocus
                placeholder="Que voulez-vous changer ? (ex. « plus court », « ton plus formel », « réponds en anglais »)"
                className="w-full rounded-lg border border-border bg-background p-3 text-base text-foreground focus:border-primary focus:outline-none lg:text-sm"
              />
              <div className="mt-2 flex gap-2">
                <Button size="sm" onClick={() => runGenerate(instruction)}>
                  Lancer la régénération
                </Button>
                <Button size="sm" variant="ghost" onClick={() => setShowInstructionInput(false)}>
                  Annuler
                </Button>
              </div>
            </div>
          )}

          <div>
            <label htmlFor="reply-to" className={label}>À</label>
            <input id="reply-to" type="text" value={recipients} onChange={(e) => setRecipients(e.target.value)} disabled={sentOk} className={input} />
            <p className="mt-1 text-xs text-muted">Séparez plusieurs destinataires par des virgules.</p>
          </div>
          <div className="grid gap-4 sm:grid-cols-2">
            <div>
              <label htmlFor="reply-cc" className={label}>Cc <span className="font-normal normal-case">(optionnel)</span></label>
              <input id="reply-cc" type="text" value={cc} onChange={(e) => setCc(e.target.value)} disabled={sentOk} className={input} />
            </div>
            <div>
              <label htmlFor="reply-bcc" className={label}>Cci <span className="font-normal normal-case">(copie cachée)</span></label>
              <input id="reply-bcc" type="text" value={bcc} onChange={(e) => setBcc(e.target.value)} disabled={sentOk} className={input} />
            </div>
          </div>
          <div>
            <label htmlFor="reply-subject" className={label}>Sujet</label>
            <input id="reply-subject" type="text" spellCheck value={subject} onChange={(e) => setSubject(e.target.value)} disabled={sentOk} className={input} />
          </div>
          <div>
            <label htmlFor="reply-body" className={label}>Brouillon (modifiable avant envoi)</label>
            <textarea
              id="reply-body"
              spellCheck
              value={draftText}
              onChange={(e) => setDraftText(e.target.value)}
              disabled={sentOk}
              rows={12}
              className="w-full rounded-lg border border-border bg-background p-3 text-base leading-relaxed text-foreground focus:border-primary focus:outline-none lg:text-sm"
            />
            <DraftFactWarnings warnings={factWarnings} text={draftText} />
          </div>

          <div>
            <p className={label}>
              Pièces jointes <span className="font-normal normal-case">({MAX_ATTACHMENTS} fichiers, 10 Mo par fichier)</span>
            </p>
            {attachments.length > 0 && (
              <ul className="mb-2 space-y-1.5">
                {attachments.map((a) => (
                  <li key={a.storagePath} className="flex items-center justify-between gap-2 rounded-lg border border-border bg-background px-3 py-2 text-sm">
                    <span className="flex min-w-0 items-center gap-2">
                      <span aria-hidden="true">📎</span>
                      <span className="truncate text-foreground">{a.filename}</span>
                      <span className="shrink-0 text-xs text-muted">{formatFileSize(a.sizeBytes)}</span>
                    </span>
                    <button
                      type="button"
                      onClick={() => setAttachments((prev) => prev.filter((x) => x.storagePath !== a.storagePath))}
                      disabled={sentOk || sending}
                      aria-label={`Retirer ${a.filename}`}
                      className="shrink-0 rounded-md px-2 py-1 text-xs text-muted hover:bg-elevated hover:text-foreground"
                    >
                      ✕
                    </button>
                  </li>
                ))}
              </ul>
            )}
            <input ref={fileInputRef} type="file" multiple onChange={handleFilesSelected} className="hidden" />
            <Button
              size="sm"
              variant="secondary"
              onClick={() => fileInputRef.current?.click()}
              disabled={sentOk || uploading || attachments.length >= MAX_ATTACHMENTS}
              isLoading={uploading}
            >
              📎 Joindre un fichier
            </Button>
          </div>

          {sentOk && (
            <div className="rounded-lg border border-success/40 bg-success/10 p-3 text-sm text-success" role="status">
              {mode === 'demo' ? '✓ Envoi simulé : le message est ajouté à l’historique de démonstration, rien n’est parti.' : '✓ E-mail envoyé.'}
            </div>
          )}

          {!sentOk && (
            <footer className="flex flex-wrap items-center justify-between gap-2">
              <Button onClick={runSend} disabled={sending} isLoading={sending}>
                Envoyer
              </Button>
              <Button variant="ghost" size="sm" onClick={() => setShowInstructionInput((v) => !v)} disabled={sending}>
                {showInstructionInput ? 'Annuler la régénération' : 'Régénérer avec une consigne'}
              </Button>
            </footer>
          )}
        </div>
      )}
    </div>
  );
}

/** Taille lisible (repris de Trendl). PUR. */
export function formatFileSize(bytes) {
  const size = Number(bytes);
  if (!Number.isFinite(size) || size <= 0) return '';
  if (size < 1024) return `${size} o`;
  if (size < 1024 * 1024) return `${Math.round(size / 1024)} Ko`;
  return `${(size / (1024 * 1024)).toFixed(1).replace('.', ',')} Mo`;
}

function deriveDefaultSubject(originalSubject) {
  const subject = (originalSubject || '').trim();
  if (!subject) return 'Re: (sans objet)';
  if (/^re\s*:/i.test(subject)) return subject;
  return `Re: ${subject}`;
}
