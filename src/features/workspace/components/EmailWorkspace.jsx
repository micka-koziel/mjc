'use client';

import { useEffect, useMemo, useState } from 'react';
import { useApp } from '@/app-shell/AppProviders';
import { useToast } from '@/shared/hooks/useToast';
import { Spinner } from '@/shared/components/Spinner';
import { EmailBodyFrame } from '@/features/mailbox/components/EmailBodyFrame';
import { displayName, summarizeRecipients } from '@/features/mailbox/lib/format-email';
import { directionOf } from '@/features/mailbox/lib/threads';
import { formatDateTime, toMs } from '@/shared/utils/format-date';
import { cn } from '@/shared/utils/cn';
import { ReplyComposer, formatFileSize } from './ReplyComposer';

/**
 * EmailWorkspace — espace de traitement d'un fil, UNIQUE et partagé :
 *  - Mailbox : s'affiche à droite quand on sélectionne un e-mail ;
 *  - Assistant IA : s'ouvre au clic sur « Répondre ».
 *
 * Reprend l'expérience QuickReplyDrawer d'Alfred (Trendl, Sprint 101.4/101.8) :
 * résumé en haut, puis onglets Réponse IA / Mail d'origine / Historique,
 * « Réponse IA » ouvert d'abord, brouillon conservé quand on change d'onglet.
 *
 * Différences avec Trendl :
 *  - le résumé porte sur le FIL de la Mailbox (Trendl : fil rattaché à une
 *    opportunité ou une collaboration du CRM) ; il est calculé par le service
 *    `summarizeThread` (Trendl réutilisait thread_summary de l'opportunité) ;
 *  - retirés : « Ouvrir la fiche », passage de l'opportunité en Négociation
 *    après envoi, contexte CRM du bandeau.
 *
 * @param {{thread: object, onClose?: () => void, onSent?: () => void}} props
 */
export function EmailWorkspace({ thread, onClose, onSent }) {
  const messages = useMemo(() => thread?.messages || [], [thread]);
  // Mail auquel on répond : le dernier message ENTRANT du fil (sinon le dernier).
  const target = useMemo(() => {
    for (let i = messages.length - 1; i >= 0; i--) if (directionOf(messages[i]) === 'inbound') return messages[i];
    return messages[messages.length - 1] || null;
  }, [messages]);
  const [tab, setTab] = useState('reply');

  if (!thread || !target) {
    return <div className="flex flex-1 items-center justify-center p-8 text-sm text-muted">Sélectionnez un e-mail.</div>;
  }

  const TABS = [
    ['reply', 'Réponse IA'],
    ['mail', 'Mail d’origine'],
    ['history', `Historique (${messages.length})`],
  ];

  return (
    <section aria-label="Traitement de l’e-mail" className="flex min-h-0 flex-1 flex-col">
      <header className="flex items-start gap-3 border-b border-border px-4 py-3">
        <div className="min-w-0 flex-1">
          <h2 className="truncate text-lg font-semibold text-foreground">{target.subject || '(sans objet)'}</h2>
          <p className="truncate text-xs text-muted">
            {target.analysis?.senderName || displayName(target.from)}
            {target.analysis?.senderCompany ? ` · ${target.analysis.senderCompany}` : ''} · {formatDateTime(toMs(target.receivedAt))}
          </p>
        </div>
        <CreateTodoButton message={target} />
        {onClose && (
          <button
            type="button"
            onClick={onClose}
            aria-label="Fermer"
            className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg text-muted hover:bg-elevated hover:text-foreground"
          >
            ✕
          </button>
        )}
      </header>

      <div className="flex min-h-0 flex-1 flex-col gap-3 overflow-y-auto p-4">
        <ThreadSummary key={`${thread.threadId}:${messages.length}`} thread={thread} />

        <div role="tablist" aria-label="Vues de l’e-mail" className="flex gap-1 border-b border-border">
          {TABS.map(([key, label]) => (
            <button
              key={key}
              id={`tab-${key}`}
              type="button"
              role="tab"
              aria-selected={tab === key}
              aria-controls={`panel-${key}`}
              onClick={() => setTab(key)}
              className={cn(
                'border-b-2 px-3 py-1.5 text-sm',
                tab === key ? 'border-primary font-semibold text-foreground' : 'border-transparent text-muted hover:text-foreground'
              )}
            >
              {label}
            </button>
          ))}
        </div>

        {/* La réponse reste montée (brouillon conservé) quand on change d'onglet. */}
        <div id="panel-reply" role="tabpanel" aria-labelledby="tab-reply" className={tab === 'reply' ? '' : 'hidden'}>
          <ReplyComposer key={target.id} message={target} onSent={onSent} />
        </div>
        {tab === 'mail' && (
          <div id="panel-mail" role="tabpanel" aria-labelledby="tab-mail">
            <MessageView message={target} />
          </div>
        )}
        {tab === 'history' && (
          <div id="panel-history" role="tabpanel" aria-labelledby="tab-history">
            <History messages={messages} />
          </div>
        )}
      </div>
    </section>
  );
}

// Cache de session : un résumé n'est recalculé que si le fil change.
const summaryCache = new Map();

function ThreadSummary({ thread }) {
  const { service } = useApp();
  const cacheKey = `${thread.threadId}:${thread.messages.length}`;
  const [state, setState] = useState(() =>
    summaryCache.has(cacheKey) ? { data: summaryCache.get(cacheKey), loading: false, error: null } : { data: null, loading: true, error: null }
  );

  useEffect(() => {
    if (summaryCache.has(cacheKey) || !service) return undefined;
    let alive = true;
    service
      .summarizeThread(thread.threadId, thread.messages)
      .then((data) => {
        summaryCache.set(cacheKey, data);
        if (alive) setState({ data, loading: false, error: null });
      })
      .catch((err) => alive && setState({ data: null, loading: false, error: err }));
    return () => {
      alive = false;
    };
  }, [cacheKey, service, thread]);

  return (
    <section aria-label="Résumé de la discussion" className="rounded-xl border border-primary/30 bg-primary-soft/60 p-3 text-sm">
      <div className="mb-1 flex items-center gap-2">
        <h3 className="text-xs font-semibold uppercase tracking-wider text-link">Résumé de la discussion</h3>
        {state.data?.simulated && <span className="text-[10px] text-muted">IA simulée (démo)</span>}
      </div>
      {state.loading && (
        <p className="flex items-center gap-2 text-muted">
          <Spinner className="h-4 w-4" /> Lecture du fil…
        </p>
      )}
      {state.error && (
        <p className="text-muted">
          Résumé indisponible pour le moment ({state.error.message}). Le fil reste consultable dans « Historique ».
        </p>
      )}
      {state.data && (
        <div className="space-y-1.5 text-foreground">
          <p>{state.data.summary}</p>
          {state.data.keyPoints?.length > 0 && (
            <ul className="list-disc space-y-0.5 pl-5 text-foreground/90">
              {state.data.keyPoints.map((k) => (
                <li key={k}>{k}</li>
              ))}
            </ul>
          )}
          {state.data.status && <p className="font-semibold">→ {state.data.status}</p>}
        </div>
      )}
    </section>
  );
}

function MessageView({ message }) {
  const to = Array.isArray(message.to) ? message.to : [message.to].filter(Boolean);
  const cc = Array.isArray(message.cc) ? message.cc : [message.cc].filter(Boolean);
  return (
    <article className="space-y-3">
      <dl className="grid grid-cols-[auto_1fr] gap-x-3 gap-y-1 text-xs">
        <dt className="text-muted">De</dt>
        <dd className="text-foreground">{message.from}</dd>
        {to.length > 0 && (
          <>
            <dt className="text-muted">À</dt>
            <dd className="text-foreground">{summarizeRecipients(to) || to.join(', ')}</dd>
          </>
        )}
        {cc.length > 0 && (
          <>
            <dt className="text-muted">Cc</dt>
            <dd className="text-foreground">{cc.join(', ')}</dd>
          </>
        )}
        <dt className="text-muted">Date</dt>
        <dd className="text-foreground">{formatDateTime(toMs(message.receivedAt))}</dd>
      </dl>
      {message.attachments?.length > 0 && (
        <ul className="flex flex-wrap gap-2">
          {message.attachments.map((a) => (
            <li key={a.filename} className="rounded-lg border border-border bg-elevated px-2 py-1 text-xs text-foreground">
              📎 {a.filename} {a.size ? <span className="text-muted">· {formatFileSize(a.size)}</span> : null}
            </li>
          ))}
        </ul>
      )}
      <div className="rounded-xl border border-border bg-surface p-3">
        <EmailBodyFrame bodyHtml={message.bodyHtml} bodyText={message.bodyText || message.snippet} />
      </div>
    </article>
  );
}

function History({ messages }) {
  const [openId, setOpenId] = useState(null);
  return (
    <ol className="space-y-2">
      {messages.map((m) => {
        const out = directionOf(m) === 'outbound';
        const open = openId === m.id;
        return (
          <li key={m.id} className={cn('rounded-lg border px-3 py-2 text-sm', out ? 'border-primary/30 bg-primary-soft/40' : 'border-border bg-surface')}>
            <button type="button" onClick={() => setOpenId(open ? null : m.id)} aria-expanded={open} className="w-full text-left">
              <span className="font-medium text-foreground">{out ? 'Vous' : displayName(m.from)}</span>
              <span className="text-xs text-muted"> · {formatDateTime(toMs(m.receivedAt))}</span>
              <span className="mt-0.5 block text-xs text-muted">{m.analysis?.summary1Line || m.snippet}</span>
            </button>
            {open && (
              <div className="mt-2">
                <MessageView message={m} />
              </div>
            )}
          </li>
        );
      })}
    </ol>
  );
}

/**
 * « Créer une tâche » depuis l'e-mail — AJOUT Quantique (découplage minimal) :
 * dans Trendl, le lien tâche ↔ e-mail passait par les collaborations du CRM.
 * Ici la tâche garde la référence du fil (source_thread_id).
 */
function CreateTodoButton({ message }) {
  const { service } = useApp();
  const { showToast } = useToast();
  const [busy, setBusy] = useState(false);
  async function create() {
    const text = window.prompt('Tâche à créer :', message.analysis?.expectedAction || `Traiter : ${message.subject || ''}`);
    if (!text || !text.trim()) return;
    setBusy(true);
    try {
      await service.createTodo({
        text: text.trim(),
        details: '',
        todo_kind: 'Ponctuel',
        due_date: new Date().toISOString().slice(0, 10),
        done: false,
        source_thread_id: message.threadId,
        source_message_id: message.id,
        source_subject: message.subject || '',
      });
      showToast({ message: 'Tâche créée (échéance aujourd’hui).', variant: 'success' });
    } catch (err) {
      showToast({ message: `Tâche non créée : ${err.message}`, variant: 'error' });
    } finally {
      setBusy(false);
    }
  }
  return (
    <button
      type="button"
      onClick={create}
      disabled={busy}
      className="shrink-0 rounded-lg border border-border px-2.5 py-1.5 text-xs font-medium text-foreground hover:bg-elevated disabled:opacity-50"
    >
      + Tâche
    </button>
  );
}
