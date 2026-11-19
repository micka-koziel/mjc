'use client';

import { useMemo, useState } from 'react';
import { useApp } from '@/app-shell/AppProviders';
import { useToast } from '@/shared/hooks/useToast';
import { brandConfig } from '@/features/brand/brand';
import { buildWorkList } from '../lib/work-list';
import { displayName } from '@/features/mailbox/lib/format-email';
import { todoDoneFields } from '@/features/todos/lib/todo-occurrence';
import { EmailWorkspace } from '@/features/workspace/components/EmailWorkspace';
import { AssistantPanel } from '@/features/assistant/components/AssistantPanel';
import { cn } from '@/shared/utils/cn';
import { formatDateCompact } from '@/features/mailbox/components/ThreadList';

/**
 * Accueil « Assistant IA » — mode LISTE uniquement.
 *
 * Inspiré de TodayPriorities (Trendl, Sprint 101 : une action = une ligne,
 * panneau assistant à droite, la liste jamais masquée par le chat). Retirés :
 * le « mode Alfred » (session conversationnelle), le bandeau chiffré du haut
 * (PipelineBand : tunnel Emails → Négociation → À encaisser) et les chiffres
 * du bas (CockpitKpis) — identifiés comme les blocs « Cap AI » —, le tableau
 * par colonnes CRM, le bouton « Débrief ».
 *
 * « Répondre » ouvre EXACTEMENT l'espace de traitement de la Mailbox
 * (EmailWorkspace) dans un volet.
 */
export function AssistantHome() {
  const { threads, todos, loading, service, user } = useApp();
  const { showToast } = useToast();
  const [openThreadId, setOpenThreadId] = useState(null);
  const [now] = useState(() => Date.now());
  const list = useMemo(
    () => buildWorkList({ threads, todos, now, importantSenders: brandConfig.priorities.importantSenders }),
    [threads, todos, now]
  );
  const openThread = openThreadId ? threads.find((t) => t.threadId === openThreadId) : null;
  const firstName = (user?.displayName || '').split(' ')[0];
  const today = new Intl.DateTimeFormat('fr-FR', { weekday: 'long', day: 'numeric', month: 'long' }).format(now);

  async function markTodoDone(item) {
    try {
      await service.updateTodo(item.todo.id, todoDoneFields(item.todo, new Date(now).toISOString().slice(0, 10)));
      showToast({ message: 'Tâche marquée comme faite.', variant: 'success' });
    } catch (err) {
      showToast({ message: `Impossible d’enregistrer : ${err.message}`, variant: 'error' });
    }
  }

  return (
    <main className="flex min-h-[calc(100vh-3.5rem)] flex-col lg:h-screen lg:min-h-0">
      <header className="border-b border-border px-4 py-3 lg:px-6">
        <h1 className="text-xl font-semibold text-foreground">Bonjour{firstName ? ` ${firstName}` : ''}</h1>
        <p className="text-sm text-muted first-letter:uppercase">{today}</p>
      </header>

      <div className="grid min-h-0 flex-1 grid-cols-1 gap-4 p-3 lg:p-5 xl:grid-cols-[minmax(0,1fr)_380px]">
        <section aria-label="À traiter" className="flex min-h-0 flex-col rounded-2xl border border-border bg-surface p-3">
          <div className="mb-2 flex items-baseline gap-3 px-1">
            <h2 className="text-base font-semibold text-foreground">À traiter</h2>
            <span className="text-xs text-muted">par priorité · règle provisoire</span>
          </div>
          {loading ? (
            <p className="px-1 py-3 text-sm text-muted">{brandConfig.assistant.name} prépare votre liste…</p>
          ) : list.length === 0 ? (
            <p className="rounded-xl bg-background px-4 py-6 text-center text-sm text-muted">Rien à traiter pour le moment. Belle journée !</p>
          ) : (
            <ol className="flex min-h-0 flex-col gap-2 overflow-y-auto">
              {list.map((item, i) =>
                item.kind === 'email' ? (
                  <EmailRow key={item.key} rank={i + 1} item={item} onReply={() => setOpenThreadId(item.thread.threadId)} />
                ) : (
                  <TodoRow
                    key={item.key}
                    rank={i + 1}
                    item={item}
                    onDone={() => markTodoDone(item)}
                    onOpenEmail={item.todo.source_thread_id ? () => setOpenThreadId(item.todo.source_thread_id) : null}
                  />
                )
              )}
            </ol>
          )}
        </section>

        <AssistantPanel onOpenThread={setOpenThreadId} workList={list} />
      </div>

      {openThread && (
        <div role="dialog" aria-modal="true" aria-label="Répondre" className="fixed inset-0 z-40 flex justify-end bg-black/30" onClick={(e) => e.target === e.currentTarget && setOpenThreadId(null)}>
          <div className="flex h-full w-full flex-col bg-background shadow-2xl lg:w-[min(860px,100vw)]">
            <EmailWorkspace thread={openThread} onClose={() => setOpenThreadId(null)} />
          </div>
        </div>
      )}
      {openThreadId && !openThread && (
        <div role="alert" className="fixed bottom-4 left-1/2 z-50 -translate-x-1/2 rounded-xl border border-border bg-surface px-4 py-3 text-sm shadow-lg">
          Cet e-mail n’est plus disponible.{' '}
          <button type="button" className="font-semibold text-link" onClick={() => setOpenThreadId(null)}>
            Fermer
          </button>
        </div>
      )}
    </main>
  );
}

function Rank({ n }) {
  return <span className="w-5 shrink-0 text-center text-xs font-bold tabular-nums text-muted">{n}</span>;
}

function EmailRow({ rank, item, onReply }) {
  const m = item.lastMessage;
  const who = m.analysis?.senderName || displayName(m.from);
  const company = m.analysis?.senderCompany;
  const unread = Array.isArray(m.labels) && m.labels.includes('UNREAD');
  return (
    <li className="row-pad flex items-start gap-3 rounded-xl border border-border bg-background px-3">
      <Rank n={rank} />
      <div className="min-w-0 flex-1">
        <p className="flex flex-wrap items-baseline gap-x-2 text-sm">
          <span className={cn('text-foreground', unread ? 'font-bold' : 'font-semibold')}>{who}</span>
          {company && <span className="text-muted">· {company}</span>}
          <span className="ml-auto text-xs text-muted">{formatDateCompact(m.receivedAt)}</span>
        </p>
        <p className="truncate text-sm font-medium text-foreground">{m.subject || '(sans objet)'}</p>
        {/* Court résumé IA sous le titre : qui, sujet, action attendue. */}
        <p className="mt-0.5 text-sm text-muted">{m.analysis?.summary1Line || m.snippet}</p>
        <p className="mt-1 text-[11px] text-muted">
          {item.thread.count > 1 ? `${item.thread.count} messages · ` : ''}
          {item.reasons.join(' · ')}
        </p>
      </div>
      <button type="button" onClick={onReply} className="h-9 shrink-0 rounded-lg bg-primary px-3 text-xs font-semibold text-primary-foreground hover:opacity-90">
        Répondre
      </button>
    </li>
  );
}

function TodoRow({ rank, item, onDone, onOpenEmail }) {
  return (
    <li className="row-pad flex items-start gap-3 rounded-xl border border-dashed border-border bg-background px-3">
      <Rank n={rank} />
      <div className="min-w-0 flex-1">
        <p className="text-sm font-semibold text-foreground">
          <span className="mr-2 rounded-full bg-elevated px-2 py-0.5 text-[10px] font-semibold text-muted">Tâche</span>
          {item.todo.text}
        </p>
        <p className="mt-0.5 text-xs text-muted">
          {item.reasons.join(' · ')}
          {item.todo.todo_kind === 'Récurrent' ? ` · ${item.todo.recurrence}` : ''}
        </p>
        {onOpenEmail && (
          <button type="button" onClick={onOpenEmail} className="mt-1 text-xs font-semibold text-link hover:underline">
            Voir l’e-mail lié : {item.todo.source_subject || 'ouvrir'}
          </button>
        )}
      </div>
      <button type="button" onClick={onDone} className="h-9 shrink-0 rounded-lg border border-border px-3 text-xs font-semibold text-foreground hover:bg-elevated">
        ✓ Fait
      </button>
    </li>
  );
}
