'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import { usePathname, useRouter, useSearchParams } from 'next/navigation';
import { useApp } from '@/app-shell/AppProviders';
import { FolderNav } from './FolderNav';
import { ThreadList } from './ThreadList';
import { SummaryPanel } from './SummaryPanel';
import { EmailWorkspace } from '@/features/workspace/components/EmailWorkspace';
import { groupByThread, mergeMessagesById } from '@/features/mailbox/lib/threads';
import { useMailboxSearch } from '@/features/mailbox/lib/useMailboxSearch';
import { useMailboxPrefs } from '@/features/mailbox/lib/useMailboxPrefs';
import { computeThreadFolder, countThreadsByFolder, MAILBOX_FOLDERS } from '@/features/mailbox/lib/compute-folder';
import { useToast } from '@/shared/hooks/useToast';

/**
 * MailboxShell — reprise de la Mailbox Trendl (Sprint 20 → 97).
 *
 * Conservé : dossiers (boîte de réception, spam, archive, envoyés, corbeille)
 * avec compteurs par conversation ; recherche locale (tous les messages du
 * fil, sans accents) + recherche étendue dans toute la messagerie ; bouton
 * « Résumer 12 h » ; liste (expéditeur, nombre de messages, objet, extrait,
 * date) ; corbeille en survol avec masquage immédiat et ré-affichage en cas
 * d'échec ; marquage « lu » à l'ouverture volontaire ; lien ?thread= ;
 * sélection automatique du plus récent sur grand écran ; liste puis lecture
 * plein écran sur mobile.
 *
 * Changé : la zone de droite n'est plus la succession de blocs du fil
 * (ThreadReader) mais l'espace de traitement partagé avec l'Assistant IA
 * (EmailWorkspace : résumé du fil + Réponse IA / Mail d'origine /
 * Historique). Retirés : pastilles de classification, bandeau « De qui on
 * parle » (acteurs CRM), actions Opportunité, panneau facture, nouvel
 * e-mail de prospection, alerte d'ingestion Trendl.
 */
export function MailboxShell() {
  const { threads: liveThreads, messages: liveMessages, loading, error, service } = useApp();
  const searchParams = useSearchParams();
  const router = useRouter();
  const pathname = usePathname();
  const threadParam = searchParams?.get('thread') || null;
  const { showToast } = useToast();
  const { prefs, setFolder, setSearch, setThreadId, openThreadInFolder, hydrated } = useMailboxPrefs();
  const [showFolders, setShowFolders] = useState(false);
  const [trashingIds, setTrashingIds] = useState(() => new Set());

  const extended = useMailboxSearch(prefs.search);
  const threads = useMemo(
    () => (extended.messages.length ? groupByThread(mergeMessagesById(liveMessages, extended.messages)) : liveThreads),
    [extended.messages, liveMessages, liveThreads]
  );
  const extendedIds = useMemo(() => new Set(extended.threadIds), [extended.threadIds]);
  const searching = Boolean(String(prefs.search || '').trim());
  const counts = useMemo(() => countThreadsByFolder(liveThreads), [liveThreads]);

  const threadsInFolder = useMemo(() => {
    // Une recherche porte sur tous les dossiers (hors corbeille et spam, sauf si on y est).
    if (searching) {
      const hidden = new Set(['trash', 'spam'].filter((f) => f !== prefs.folder));
      return threads.filter((t) => !hidden.has(computeThreadFolder(t.messages)));
    }
    return threads.filter((t) => computeThreadFolder(t.messages) === prefs.folder);
  }, [threads, prefs.folder, searching]);
  const visibleThreads = useMemo(() => threadsInFolder.filter((t) => !trashingIds.has(t.threadId)), [threadsInFolder, trashingIds]);
  const activeThread = useMemo(
    () => (prefs.threadId ? threads.find((t) => t.threadId === prefs.threadId) || null : null),
    [threads, prefs.threadId]
  );

  // Fil demandé par lien (?thread=), par exemple depuis l'Assistant IA.
  const consumedRef = useRef(null);
  useEffect(() => {
    if (!hydrated || !threadParam || consumedRef.current === threadParam) return;
    const target = threads.find((t) => t.threadId === threadParam);
    if (!target) return;
    consumedRef.current = threadParam;
    openThreadInFolder(computeThreadFolder(target.messages), threadParam);
    markRead(target.messages);
    router.replace(pathname, { scroll: false });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [hydrated, threadParam, threads]);

  // Grand écran : sélection automatique du plus récent du dossier.
  const [isDesktop] = useState(() => (typeof window !== 'undefined' ? window.matchMedia('(min-width: 1024px)').matches : true));
  const autoRef = useRef(false);
  useEffect(() => {
    if (!hydrated || !isDesktop || autoRef.current || loading || threadParam) return;
    if (prefs.threadId && activeThread) {
      autoRef.current = true;
      return;
    }
    if (threadsInFolder.length > 0) {
      autoRef.current = true;
      setThreadId(threadsInFolder[0].threadId);
    }
  }, [hydrated, isDesktop, loading, threadParam, prefs.threadId, activeThread, threadsInFolder, setThreadId]);

  function markRead(messages) {
    // Comme Trendl (Sprint 89) : ouvrir un fil = lu ; jamais bloquant.
    for (const m of messages || []) {
      if (Array.isArray(m.labels) && m.labels.includes('UNREAD')) service.applyAction(m.id, 'mark_read').catch(() => {});
    }
  }

  async function handleTrash(thread) {
    // Sémantique Trendl conservée : la corbeille s'applique au DERNIER message
    // du fil (corbeille Gmail, récupérable 30 jours côté fournisseur).
    const last = thread?.messages?.[thread.messages.length - 1];
    if (!last?.id) return;
    setTrashingIds((prev) => new Set(prev).add(thread.threadId));
    if (prefs.threadId === thread.threadId) setThreadId(null);
    try {
      await service.applyAction(last.id, 'trash');
      showToast({ message: 'E-mail mis à la corbeille.', variant: 'success' });
    } catch (err) {
      showToast({ message: `Suppression impossible : ${err.message}`, variant: 'error' });
      setTrashingIds((prev) => {
        const next = new Set(prev);
        next.delete(thread.threadId);
        return next;
      });
    }
  }

  if (!hydrated) {
    return <div className="flex flex-1 items-center justify-center p-8 text-sm text-muted">Chargement de la Mailbox…</div>;
  }

  const showReaderMobile = Boolean(prefs.threadId);
  const folderLabel = MAILBOX_FOLDERS.find((f) => f.id === prefs.folder)?.label || prefs.folder;

  return (
    <div className="flex h-[calc(100vh-3.5rem)] flex-col overflow-hidden lg:h-screen lg:flex-row">
      {/* Zone de gauche : commandes + liste */}
      <section className={`flex flex-col overflow-hidden border-border lg:w-[26rem] lg:border-r ${showReaderMobile ? 'hidden lg:flex' : 'flex flex-1'}`}>
        <div className="space-y-2 border-b border-border p-3">
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={() => setShowFolders((v) => !v)}
              aria-expanded={showFolders}
              className="flex h-10 min-w-0 flex-1 items-center gap-1.5 rounded-lg border border-border bg-surface px-2.5 text-sm font-medium text-foreground hover:bg-elevated"
              title="Changer de dossier"
            >
              ☰ <span className="truncate">{folderLabel}</span>
              {counts[prefs.folder] > 0 && (
                <span className="rounded-full bg-primary/15 px-1.5 py-0.5 text-xs text-link">{counts[prefs.folder]}</span>
              )}
              <span className="ml-auto text-xs text-muted" aria-hidden="true">{showFolders ? '▴' : '▾'}</span>
            </button>
            <SummaryPanel onOpenThread={(id) => router.push(`/mailbox?thread=${encodeURIComponent(id)}`)} />
          </div>
          <input
            type="search"
            value={prefs.search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Rechercher : nom, entreprise, objet, texte, pièce jointe…"
            aria-label="Rechercher dans la Mailbox"
            className="h-10 w-full rounded-lg border border-border bg-surface px-3 text-base text-foreground placeholder:text-disabled focus:border-primary focus:outline-none lg:text-sm"
          />
        </div>
        {showFolders && (
          <div className="border-b border-border">
            <FolderNav
              display="desktop"
              activeFolder={prefs.folder}
              counts={counts}
              onSelect={(id) => {
                setFolder(id);
                setShowFolders(false);
              }}
            />
          </div>
        )}
        {error && (
          <div className="border-b border-danger/40 bg-danger/10 p-3 text-xs text-danger">
            Synchronisation impossible : {error.message}. Les e-mails affichés peuvent ne pas être à jour.
          </div>
        )}
        {loading ? (
          <p className="p-6 text-center text-sm text-muted">Chargement des e-mails…</p>
        ) : (
          <ThreadList
            threads={visibleThreads}
            activeThreadId={prefs.threadId}
            onSelect={(id) => {
              setThreadId(id);
              const opened = threads.find((t) => t.threadId === id);
              if (opened) markRead(opened.messages);
            }}
            search={prefs.search}
            alwaysShowIds={extendedIds}
            searchPending={extended.searching}
            onTrash={prefs.folder === 'trash' ? undefined : handleTrash}
          />
        )}
      </section>

      {/* Zone de droite : espace de traitement partagé */}
      <div className={`flex min-w-0 flex-1 flex-col overflow-hidden ${showReaderMobile ? 'flex' : 'hidden lg:flex'}`}>
        <EmailWorkspace key={activeThread?.threadId || 'none'} thread={activeThread} onClose={showReaderMobile ? () => setThreadId(null) : undefined} />
      </div>
    </div>
  );
}
