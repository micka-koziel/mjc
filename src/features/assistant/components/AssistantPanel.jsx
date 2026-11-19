'use client';

import { useRef, useState } from 'react';
import { useApp } from '@/app-shell/AppProviders';
import { useToast } from '@/shared/hooks/useToast';
import { brandConfig } from '@/features/brand/brand';
import { AssistantAvatar } from './AssistantAvatar';
import { SummaryPanel } from '@/features/mailbox/components/SummaryPanel';
import { computeThreadFolder } from '@/features/mailbox/lib/compute-folder';
import { displayName } from '@/features/mailbox/lib/format-email';
import { Button } from '@/shared/components/Button';
import { Spinner } from '@/shared/components/Spinner';
import { ConfirmButton } from '@/shared/components/ConfirmButton';

/**
 * Assistant conversationnel de l'accueil, limité aux e-mails.
 *
 * Reprend l'AlfredPanel de Trendl (commandes en boutons + chat). Audit des
 * commandes Trendl (ALFRED_COMMANDS) :
 *  - « Le point du jour »        → conservée, renommée « En attente de réponse » / « Tâches du jour » ;
 *  - « Préparer un RDV », « Relances à faire », « Factures à créer »,
 *    « Radar publicitaire », « Résumé de la semaine » → RETIRÉES (CRM,
 *    recouvrement, veille).
 * Ajoutées (demandées) : « Résumer les 12 dernières heures », « Voir les spams ».
 *
 * Chaque commande a un comportement réel (calcul local ou service) ; aucune
 * commande décorative.
 */
export const QUICK_COMMANDS = Object.freeze([
  { id: 'summary12', label: 'Résumer les 12 dernières heures' },
  { id: 'spams', label: 'Voir les spams' },
  { id: 'awaiting', label: 'E-mails en attente de réponse' },
  { id: 'todos', label: 'Mes tâches du jour' },
]);

export function AssistantPanel({ onOpenThread, workList = [] }) {
  const { service, threads, mode } = useApp();
  const name = brandConfig.assistant.name;
  const [entries, setEntries] = useState([]); // {role, text?, spam?}
  const [q, setQ] = useState('');
  const [busy, setBusy] = useState(false);
  const [conversationId, setConversationId] = useState(null);
  const endRef = useRef(null);

  function push(...items) {
    setEntries((prev) => [...prev, ...items]);
    setTimeout(() => endRef.current?.scrollIntoView({ behavior: 'smooth', block: 'end' }), 50);
  }

  function runCommand(id) {
    if (id === 'spams') {
      push({ role: 'user', text: 'Montre-moi les spams pour que je puisse les supprimer.' }, { role: 'assistant', spam: true });
    } else if (id === 'awaiting') {
      const emails = workList.filter((i) => i.kind === 'email');
      push(
        { role: 'user', text: 'Quels e-mails attendent ma réponse ?' },
        {
          role: 'assistant',
          text: emails.length
            ? `${emails.length} e-mail${emails.length > 1 ? 's attendent' : ' attend'} votre réponse, du plus prioritaire au moins prioritaire :`
            : 'Aucun e-mail n’attend votre réponse.',
          links: emails.slice(0, 6).map((i) => ({
            threadId: i.thread.threadId,
            label: `${i.lastMessage.analysis?.senderName || displayName(i.lastMessage.from)} — ${i.lastMessage.subject}`,
          })),
        }
      );
    } else if (id === 'todos') {
      const todos = workList.filter((i) => i.kind === 'todo');
      push(
        { role: 'user', text: 'Quelles sont mes tâches du jour ?' },
        {
          role: 'assistant',
          text: todos.length
            ? `Tâches à faire aujourd’hui :\n${todos.map((t) => `• ${t.todo.text} (${t.reasons.join(', ')})`).join('\n')}`
            : 'Aucune tâche à faire aujourd’hui.',
        }
      );
    }
  }

  async function ask(e) {
    e.preventDefault();
    const question = q.trim();
    if (!question) return;
    setQ('');
    push({ role: 'user', text: question });
    setBusy(true);
    try {
      const r = await service.askAssistant({ question, conversationId, assistant: brandConfig.assistant });
      if (r.conversationId) setConversationId(r.conversationId);
      push({ role: 'assistant', text: r.text });
    } catch (err) {
      push({ role: 'assistant', text: `Je ne peux pas répondre pour le moment (${err.message}).`, error: true });
    } finally {
      setBusy(false);
    }
  }

  const cmd =
    'flex min-h-10 items-center justify-center rounded-xl border border-border bg-background px-2 py-1.5 text-center text-xs font-medium text-foreground hover:border-primary hover:bg-elevated';

  return (
    <aside aria-label={name} className="flex min-h-[420px] flex-col gap-3 rounded-2xl border border-primary/30 bg-primary-soft/40 p-3 xl:min-h-0">
      <div className="flex items-center gap-3">
        <AssistantAvatar size="lg" />
        <div>
          <p className="font-semibold text-foreground">{name}</p>
          <p className="text-xs text-muted">{brandConfig.assistant.tagline}{mode === 'demo' ? ' · démo' : ''}</p>
        </div>
      </div>

      <div className="grid grid-cols-2 gap-1.5">
        {QUICK_COMMANDS.map((c) =>
          c.id === 'summary12' ? (
            <SummaryPanel
              key={c.id}
              onOpenThread={onOpenThread}
              renderTrigger={(open) => (
                <button type="button" className={cmd} onClick={open}>
                  {c.label}
                </button>
              )}
            />
          ) : (
            <button key={c.id} type="button" className={cmd} onClick={() => runCommand(c.id)}>
              {c.label}
            </button>
          )
        )}
      </div>

      <div className="flex min-h-0 flex-1 flex-col gap-2 overflow-y-auto rounded-xl bg-surface p-2" aria-live="polite">
        {entries.length === 0 && (
          <div className="m-auto flex max-w-[17rem] flex-col items-center gap-2 text-center">
            <AssistantAvatar size="lg" />
            <p className="text-sm font-semibold text-foreground">{brandConfig.assistant.welcome || `Bonjour, je suis ${name} !`}</p>
            <p className="text-xs text-muted">Posez-moi une question sur vos e-mails, ou utilisez une commande ci-dessus.</p>
          </div>
        )}
        {entries.map((en, i) =>
          en.spam ? (
            <SpamReview key={i} threads={threads} onOpenThread={onOpenThread} />
          ) : (
            <div key={i} className={en.role === 'user' ? 'flex justify-end' : 'flex items-start gap-2'}>
            {en.role !== 'user' && <AssistantAvatar size="sm" className="mt-0.5" />}
            <div
              className={
                en.role === 'user'
                  ? 'ml-6 rounded-xl bg-primary px-3 py-2 text-sm text-primary-foreground'
                  : `mr-6 whitespace-pre-wrap rounded-xl border px-3 py-2 text-sm ${en.error ? 'border-danger/40 text-danger' : 'border-border bg-background text-foreground'}`
              }
            >
              {en.text}
              {en.links?.length > 0 && (
                <ul className="mt-1 space-y-1">
                  {en.links.map((l) => (
                    <li key={l.threadId}>
                      <button type="button" onClick={() => onOpenThread(l.threadId)} className="text-left text-xs font-semibold text-link hover:underline">
                        {l.label}
                      </button>
                    </li>
                  ))}
                </ul>
              )}
            </div>
            </div>
          )
        )}
        {busy && (
          <p className="flex items-center gap-2 text-xs text-muted">
            <AssistantAvatar size="sm" /> <Spinner className="h-3 w-3" /> {name} réfléchit…
          </p>
        )}
        <div ref={endRef} />
      </div>

      <form onSubmit={ask} className="flex gap-1.5">
        <label htmlFor="ask-assistant" className="sr-only">
          Demander à {name}
        </label>
        <input
          id="ask-assistant"
          value={q}
          onChange={(e) => setQ(e.target.value)}
          placeholder={`Demander à ${name}…`}
          className="h-10 min-w-0 flex-1 rounded-xl border border-border bg-background px-3 text-sm text-foreground placeholder:text-muted"
        />
        <Button type="submit" disabled={busy || !q.trim()}>
          Demander
        </Button>
      </form>
    </aside>
  );
}

/**
 * « Voir les spams » : liste à cocher, puis corbeille des SEULS messages
 * choisis, après confirmation. Aucune suppression globale automatique.
 */
function SpamReview({ threads, onOpenThread }) {
  const { service } = useApp();
  const { showToast } = useToast();
  const spams = threads.filter((t) => computeThreadFolder(t.messages) === 'spam');
  const [selected, setSelected] = useState(() => new Set());
  const [done, setDone] = useState(() => new Set());
  const [busy, setBusy] = useState(false);
  const visible = spams.filter((t) => !done.has(t.threadId));

  function toggle(id) {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  async function trashSelected() {
    const chosen = visible.filter((t) => selected.has(t.threadId));
    if (!chosen.length) return;
    setBusy(true);
    let ok = 0;
    for (const t of chosen) {
      try {
        for (const m of t.messages) await service.applyAction(m.id, 'trash');
        ok += 1;
        setDone((prev) => new Set(prev).add(t.threadId));
      } catch (err) {
        showToast({ message: `« ${t.lastSubject} » : ${err.message}`, variant: 'error' });
      }
    }
    setSelected(new Set());
    setBusy(false);
    if (ok) showToast({ message: `${ok} e-mail${ok > 1 ? 's' : ''} mis à la corbeille.`, variant: 'success' });
  }

  if (spams.length === 0) return <p className="mr-6 rounded-xl border border-border bg-background px-3 py-2 text-sm">Aucun e-mail dans les spams.</p>;
  return (
    <div className="mr-6 rounded-xl border border-border bg-background p-2 text-sm">
      <p className="px-1 pb-1 text-foreground">
        {visible.length} e-mail{visible.length > 1 ? 's' : ''} en spam. Cochez ceux à supprimer :
      </p>
      <ul className="space-y-1">
        {visible.map((t) => (
          <li key={t.threadId} className="flex items-start gap-2 rounded-lg px-1 py-1 hover:bg-elevated">
            <input
              id={`spam-${t.threadId}`}
              type="checkbox"
              checked={selected.has(t.threadId)}
              onChange={() => toggle(t.threadId)}
              className="mt-1 accent-[var(--q-primary)]"
            />
            <label htmlFor={`spam-${t.threadId}`} className="min-w-0 flex-1 cursor-pointer">
              <span className="block truncate font-medium text-foreground">{t.lastSubject}</span>
              <span className="block truncate text-xs text-muted">{displayName(t.lastFrom)}</span>
            </label>
            <button type="button" onClick={() => onOpenThread(t.threadId)} className="shrink-0 text-xs font-semibold text-link hover:underline">
              Lire
            </button>
          </li>
        ))}
      </ul>
      {visible.length > 0 && (
        <div className="mt-2 flex items-center gap-2 px-1">
          <ConfirmButton
            onConfirm={trashSelected}
            disabled={!selected.size || busy}
            confirmLabel={`Confirmer : ${selected.size} à la corbeille`}
            className="h-8 rounded-lg bg-danger px-3 text-sm font-medium text-danger-foreground disabled:opacity-50"
          >
            {busy ? 'Suppression…' : `Mettre à la corbeille (${selected.size})`}
          </ConfirmButton>
          <button
            type="button"
            className="text-xs text-muted hover:underline"
            onClick={() => setSelected(new Set(visible.map((t) => t.threadId)))}
          >
            Tout cocher
          </button>
        </div>
      )}
    </div>
  );
}
