'use client';

import { useState } from 'react';
import { useApp } from '@/app-shell/AppProviders';
import { useToast } from '@/shared/hooks/useToast';
import { plainText } from '@/shared/utils/plain-text';

const btn = 'h-7 rounded-lg px-2.5 text-xs font-semibold';
const primary = `${btn} bg-primary text-primary-foreground hover:opacity-90`;
const secondary = `${btn} border border-border bg-surface text-foreground hover:border-primary`;

/**
 * Réponse de l'assistant : une phrase, puis des actions numérotées avec
 * leurs boutons (Répondre / Ouvrir / + Tâche / Fait). Un bouton n'apparaît
 * que s'il mène quelque part : fil présent dans la boîte, tâche existante.
 *
 * actions : {title, threadId?, due?, kind: 'repondre'|'ouvrir'|'tache', todoId?}
 */
export function AssistantAnswer({ text, actions = [], error, onOpenThread }) {
  const { threads } = useApp();
  const known = new Set((threads || []).map((t) => t.threadId));
  return (
    <div className={`min-w-0 flex-1 rounded-xl border px-3 py-2 text-sm ${error ? 'border-danger/40 text-danger' : 'border-border bg-background text-foreground'}`}>
      <p className="whitespace-pre-wrap font-medium">{plainText(text)}</p>
      {actions.length > 0 && (
        <ol className="mt-2 space-y-1.5">
          {actions.map((a, i) => (
            <ActionItem key={`${i}-${a.title}`} rank={i + 1} action={a} threadOk={Boolean(a.threadId && known.has(a.threadId))} onOpenThread={onOpenThread} />
          ))}
        </ol>
      )}
    </div>
  );
}

function ActionItem({ rank, action, threadOk, onOpenThread }) {
  const { service } = useApp();
  const { showToast } = useToast();
  const [state, setState] = useState(null); // 'todo' | 'done'
  const title = plainText(action.title);

  async function addTodo() {
    try {
      await service.createTodo({
        text: title,
        details: action.due ? `Échéance : ${action.due}` : '',
        todo_kind: 'Ponctuel',
        due_date: new Date().toISOString().slice(0, 10),
        done: false,
        ...(threadOk ? { source_thread_id: action.threadId } : {}),
      });
      setState('todo');
    } catch (err) {
      showToast({ message: `Tâche non créée : ${err.message}`, variant: 'error' });
    }
  }

  async function markDone() {
    try {
      await service.updateTodo(action.todoId, { done: true });
      setState('done');
    } catch (err) {
      showToast({ message: `Impossible de cocher : ${err.message}`, variant: 'error' });
    }
  }

  return (
    <li className="rounded-lg bg-surface px-2 py-1.5">
      <p className={`flex gap-1.5 text-[13px] leading-snug ${state === 'done' ? 'text-muted line-through' : ''}`}>
        <span className="font-semibold text-primary">{rank}.</span>
        <span>
          {title}
          {action.due && <span className="ml-1.5 whitespace-nowrap rounded-full bg-primary-soft px-1.5 py-0.5 text-[11px] font-semibold text-primary">{plainText(action.due)}</span>}
        </span>
      </p>
      <div className="mt-1 flex flex-wrap gap-1.5 pl-4">
        {threadOk && (
          <button type="button" className={action.kind === 'ouvrir' ? secondary : primary} onClick={() => onOpenThread(action.threadId)}>
            {action.kind === 'ouvrir' ? 'Ouvrir' : 'Répondre'}
          </button>
        )}
        {action.todoId ? (
          state === 'done' ? (
            <span className="text-xs font-semibold text-success">Fait ✓</span>
          ) : (
            <button type="button" className={primary} onClick={markDone}>
              Fait
            </button>
          )
        ) : state === 'todo' ? (
          <span className="self-center text-xs font-semibold text-success">Ajoutée aux tâches ✓</span>
        ) : (
          <button type="button" className={secondary} onClick={addTodo}>
            + Tâche
          </button>
        )}
      </div>
    </li>
  );
}
