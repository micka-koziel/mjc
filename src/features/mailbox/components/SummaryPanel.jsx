'use client';

import { useState } from 'react';
import { useApp } from '@/app-shell/AppProviders';
import { Button } from '@/shared/components/Button';
import { Spinner } from '@/shared/components/Spinner';
import { useToast } from '@/shared/hooks/useToast';
import { displayName } from '@/features/mailbox/lib/format-email';

/**
 * SummaryPanel — « Résumer 12 h » (repris de Trendl, Sprint 20/21/23).
 *
 * Périmètre (identique à la Cloud Function summarizeRecentEmails) : messages
 * reçus depuis 12 h, présents en boîte de réception, pas encore triés.
 * Le panneau ne se ferme pas après une action, pour enchaîner le tri.
 *
 * Actions par e-mail : Répondre (ouvre l'espace de traitement), Spam,
 * Corbeille, Ignorer (archive) — même sémantique que applyGmailAction.
 * Retirée : « Opportunité » (création d'opportunité CRM).
 *
 * Utilisé par la Mailbox (bouton) et par l'Assistant IA (commande rapide).
 */
export function SummaryPanel({ onOpenThread, renderTrigger }) {
  const { service } = useApp();
  const [open, setOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState(null);
  const [error, setError] = useState(null);

  async function runSummary() {
    setLoading(true);
    setError(null);
    setResult(null);
    try {
      setResult(await service.summarizeRecent(12));
    } catch (err) {
      setError(err.message || 'Service indisponible.');
    } finally {
      setLoading(false);
    }
  }

  function handleOpen() {
    setOpen(true);
    if (!result && !loading) runSummary();
  }

  return (
    <>
      {renderTrigger ? (
        renderTrigger(handleOpen)
      ) : (
        <button
          type="button"
          onClick={handleOpen}
          title="Résumer les e-mails reçus ces 12 dernières heures"
          className="h-10 shrink-0 rounded-lg bg-primary px-3 text-sm font-medium text-primary-foreground transition-opacity hover:opacity-90 lg:px-4"
        >
          <span className="hidden lg:inline">✨ Résumer 12 h</span>
          <span className="lg:hidden">✨ 12 h</span>
        </button>
      )}

      {open && (
        <div
          role="dialog"
          aria-modal="true"
          aria-label="Résumé des 12 dernières heures"
          className="fixed inset-0 z-50 flex items-stretch justify-end bg-black/30"
          onClick={(e) => e.target === e.currentTarget && setOpen(false)}
        >
          <aside className="flex h-full w-full flex-col overflow-hidden border-l border-border bg-surface lg:w-[480px]">
            <header className="flex items-center justify-between border-b border-border px-4 py-3">
              <div>
                <h2 className="text-base font-semibold">Résumé des 12 dernières heures</h2>
                {result?.simulated && <p className="text-xs text-muted">IA simulée (démo)</p>}
              </div>
              <button
                type="button"
                onClick={() => setOpen(false)}
                className="flex h-10 w-10 items-center justify-center rounded-lg text-muted hover:bg-elevated hover:text-foreground"
                aria-label="Fermer"
              >
                ✕
              </button>
            </header>
            <div className="flex-1 space-y-4 overflow-y-auto p-4">
              {loading && (
                <div className="flex flex-col items-center gap-3 py-8 text-sm text-muted">
                  <Spinner className="h-6 w-6" />
                  <p>Lecture des e-mails reçus ces 12 dernières heures…</p>
                </div>
              )}
              {error && (
                <div className="rounded-lg border border-danger/40 bg-danger/10 p-3 text-sm text-danger">
                  <p className="font-semibold">Résumé indisponible</p>
                  <p className="mt-1 break-words">{error}</p>
                  <Button variant="secondary" size="sm" className="mt-3" onClick={runSummary}>
                    Réessayer
                  </Button>
                </div>
              )}
              {result && !loading && (
                <SummaryResult
                  result={result}
                  onOpenThread={(id) => {
                    setOpen(false);
                    onOpenThread?.(id);
                  }}
                  onDone={(id) =>
                    setResult((prev) => ({ ...prev, items: (prev?.items || []).filter((it) => it.id !== id) }))
                  }
                />
              )}
            </div>
          </aside>
        </div>
      )}
    </>
  );
}

function SummaryResult({ result, onOpenThread, onDone }) {
  if (!result.items || result.items.length === 0) {
    return (
      <p className="rounded-lg border border-border bg-elevated p-4 text-sm text-muted">
        Aucun e-mail à trier ces 12 dernières heures (déjà triés ou hors boîte de réception).
      </p>
    );
  }
  return (
    <>
      {result.summary_text && (
        <section className="rounded-lg border border-primary/30 bg-primary-soft/60 p-3">
          <h3 className="text-xs font-semibold uppercase tracking-wider text-link">Vue d’ensemble</h3>
          <p className="mt-1 whitespace-pre-wrap text-sm text-foreground">{result.summary_text}</p>
        </section>
      )}
      <ul className="space-y-2">
        {result.items.map((it) => (
          <li key={it.id}>
            <SummaryItem item={it} onOpenThread={onOpenThread} onDone={onDone} />
          </li>
        ))}
      </ul>
    </>
  );
}

function SummaryItem({ item, onOpenThread, onDone }) {
  const { service } = useApp();
  const { showToast } = useToast();
  const [busy, setBusy] = useState(null);
  async function act(action, label) {
    setBusy(action);
    try {
      await service.applyAction(item.id, action);
      showToast({ message: label, variant: 'success' });
      onDone(item.id);
    } catch (err) {
      showToast({ message: `Action impossible : ${err.message}`, variant: 'error' });
    } finally {
      setBusy(null);
    }
  }
  return (
    <article className="rounded-lg border border-border bg-background p-3">
      <p className="truncate text-sm font-semibold text-foreground">{item.subject || '(sans objet)'}</p>
      <p className="text-xs text-muted">{displayName(item.from)}</p>
      {item.snippet && <p className="mt-1 line-clamp-2 text-xs text-foreground">{item.snippet}</p>}
      <div className="mt-2 flex flex-wrap gap-1.5">
        <Button size="sm" onClick={() => onOpenThread(item.threadId)}>
          Répondre
        </Button>
        <Button size="sm" variant="secondary" isLoading={busy === 'spam'} disabled={Boolean(busy)} onClick={() => act('spam', 'Classé en spam.')}>
          Spam
        </Button>
        <Button size="sm" variant="secondary" isLoading={busy === 'trash'} disabled={Boolean(busy)} onClick={() => act('trash', 'Mis à la corbeille.')}>
          Corbeille
        </Button>
        <Button size="sm" variant="ghost" isLoading={busy === 'archive'} disabled={Boolean(busy)} onClick={() => act('archive', 'Archivé.')}>
          Ignorer
        </Button>
      </div>
    </article>
  );
}
