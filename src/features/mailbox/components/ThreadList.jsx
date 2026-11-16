'use client';

import { useMemo } from 'react';
import {
  displayName,
  initialsFromAddress,
} from '@/features/mailbox/lib/format-email';
import { cn } from '@/shared/utils/cn';
import { toMs } from '@/shared/utils/format-date';
import { fold, matchesQuery, normalizeSearch } from '@/shared/utils/text-fold';

/**
 * ThreadList — Liste des threads d'un folder, format Gmail-like.
 *
 * Chaque ligne montre :
 *  - Avatar circulaire avec initiales du sender
 *  - Nom du sender en gras
 *  - Subject + snippet (1 ligne tronquée)
 *  - Date courte (HH:mm aujourd'hui, sinon date)
 *  - Badge "+N" si thread > 1 message
 *
 * KHentik : la pastille de couleur de classification métier de Trendl
 * (opportunité / commercial / spam / transactionnel / traité) est RETIRÉE.
 * Seules restent les couleurs d'interface (sélection, non lu, suppression).
 *
 * Mobile : pleine largeur, drilldown au clic.
 * Desktop : item compact, sélection inline.
 *
 * @param {object} props
 * @param {Array} props.threads
 * @param {string|null} props.activeThreadId
 * @param {(id: string) => void} props.onSelect
 * @param {string} [props.search] Filtre de recherche
 * @param {(thread: object) => void} [props.onTrash] Sprint 29 PR1 —
 *   callback appelé quand on clique sur l'icône corbeille d'une ligne.
 *   Si absent, l'icône n'est pas rendue (ex : dossier Corbeille).
 */
export function ThreadList({
  threads,
  activeThreadId,
  onSelect,
  search = '',
  alwaysShowIds,
  searchPending = false,
  onTrash,
}) {
  // Mémoïsé : évite de re-filtrer toute la liste sur les rendus où ni les
  // threads ni la recherche n'ont changé (ex. changement de sélection).
  const filtered = useMemo(
    () => filterThreads(threads, search, alwaysShowIds),
    [threads, search, alwaysShowIds],
  );

  if (filtered.length === 0) {
    return (
      <div className="flex flex-1 items-center justify-center p-8 text-sm text-muted">
        {search
          ? searchPending
            ? 'Recherche dans toute la messagerie…'
            : `Aucune conversation ne correspond à « ${search} ».`
          : 'Aucun message dans ce dossier.'}
      </div>
    );
  }

  return (
    <ul
      className="flex-1 divide-y divide-border overflow-y-auto overscroll-contain"
      role="listbox"
      aria-label="Liste des conversations"
    >
      {filtered.map((thread) => {
        const isActive = thread.threadId === activeThreadId;
        const unread = thread.messages.some((m) => Array.isArray(m.labels) && m.labels.includes('UNREAD'));
        return (
          <li
            key={thread.threadId}
            role="option"
            aria-selected={isActive}
            className="group relative"
          >
            <button
              type="button"
              onClick={() => onSelect(thread.threadId)}
              className={cn(
                'row-pad flex w-full items-start gap-3 px-3 pr-12 text-left transition-colors',
                isActive
                  ? 'bg-primary/10 hover:bg-primary/15'
                  : 'hover:bg-elevated/60',
              )}
            >
              <div
                aria-hidden="true"
                className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-elevated text-xs font-semibold text-muted"
              >
                {initialsFromAddress(thread.lastFrom)}
              </div>
              <div className="min-w-0 flex-1">
                <div className="flex items-baseline justify-between gap-2">
                  <p className={cn('truncate text-sm text-foreground', unread ? 'font-bold' : 'font-semibold')}>
                    {unread && <span className="sr-only">Non lu : </span>}
                    {displayName(thread.lastFrom) || '(expéditeur inconnu)'}
                    {thread.count > 1 && (
                      <span className="ml-1 font-normal text-muted">
                        ({thread.count})
                      </span>
                    )}
                  </p>
                  <time className="shrink-0 text-xs text-muted">
                    {formatDateCompact(thread.lastReceivedAt)}
                  </time>
                </div>
                <p className="truncate text-sm text-foreground">
                  {thread.lastSubject || '(sans sujet)'}
                </p>
                <p className="truncate text-xs text-muted">{thread.lastSnippet}</p>
              </div>
            </button>
            {onTrash && (
              <button
                type="button"
                onClick={(e) => {
                  e.stopPropagation();
                  onTrash(thread);
                }}
                aria-label="Mettre à la corbeille"
                title="Mettre à la corbeille"
                className="absolute right-2 top-1/2 flex h-8 w-8 -translate-y-1/2 items-center justify-center rounded-md text-muted opacity-0 transition-opacity hover:bg-danger/10 hover:text-danger focus:opacity-100 focus:outline-none focus-visible:ring-2 focus-visible:ring-danger/40 group-hover:opacity-100 max-lg:opacity-100"
              >
                <TrashIcon />
              </button>
            )}
          </li>
        );
      })}
    </ul>
  );
}

/**
 * Filtre une liste de threads par texte de recherche.
 *
 * Sprint 97 (Aurel 13/10) — on cherche dans TOUS les messages du fil (objet,
 * expéditeur, destinataires, extrait, début du corps, acteurs reconnus), plus
 * seulement le dernier. Les fils trouvés par Gmail (`alwaysShowIds`) restent
 * affichés même si le mot n'est pas dans ce qu'on a en local (pièce jointe…).
 */
export function filterThreads(threads, search, alwaysShowIds) {
  // Sprint 89 — insensible aux accents (repliage partagé text-fold).
  const needle = normalizeSearch(search);
  if (!needle) return threads;
  return threads.filter((t) => {
    if (alwaysShowIds && alwaysShowIds.has(t.threadId)) return true;
    return matchesQuery(threadHaystack(t), needle);
  });
}

const BODY_SEARCH_CHARS = 4000;

function threadHaystack(t) {
  const parts = [t.lastSubject, t.lastFrom, t.lastSnippet];
  for (const m of Array.isArray(t.messages) ? t.messages : []) {
    parts.push(
      m.subject,
      m.from,
      Array.isArray(m.to) ? m.to.join(' ') : m.to,
      Array.isArray(m.cc) ? m.cc.join(' ') : m.cc,
      m.snippet,
      String(m.bodyText || '').slice(0, BODY_SEARCH_CHARS),
      // KHentik : plus d'acteurs CRM (marques, créateurs…) ; on cherche
      // aussi le nom et l'entreprise détectés par l'IA, et les pièces jointes.
      m.analysis?.senderName,
      m.analysis?.senderCompany,
      ...(Array.isArray(m.attachments) ? m.attachments.map((a) => a.filename) : []),
    );
  }
  return fold(parts.filter(Boolean).join(' '));
}

/**
 * Format court : HH:mm aujourd'hui, "Hier", sinon DD/MM.
 */
export function formatDateCompact(ts) {
  const d = toDate(ts);
  if (!d) return '—';
  const now = new Date();
  const isSameDay =
    d.getFullYear() === now.getFullYear() &&
    d.getMonth() === now.getMonth() &&
    d.getDate() === now.getDate();
  if (isSameDay) {
    return `${pad(d.getHours())}:${pad(d.getMinutes())}`;
  }
  const yesterday = new Date(now);
  yesterday.setDate(now.getDate() - 1);
  const isYesterday =
    d.getFullYear() === yesterday.getFullYear() &&
    d.getMonth() === yesterday.getMonth() &&
    d.getDate() === yesterday.getDate();
  if (isYesterday) return 'Hier';
  return `${pad(d.getDate())}/${pad(d.getMonth() + 1)}`;
}

function toDate(ts) {
  // KHentik : nombre (démo) ou Timestamp Firestore (réel), via toMs.
  const ms = toMs(ts);
  return ms === null ? null : new Date(ms);
}

function pad(n) {
  return n.toString().padStart(2, '0');
}

/**
 * Icône corbeille inline (Sprint 29 PR1). SVG maison — pas de lib d'icônes
 * sur trendl-app (cf convention SVG inline uniquement).
 */
function TrashIcon() {
  return (
    <svg
      width="16"
      height="16"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      <polyline points="3 6 5 6 21 6" />
      <path d="M19 6l-1 14a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2L5 6" />
      <path d="M10 11v6" />
      <path d="M14 11v6" />
      <path d="M9 6V4a1 1 0 0 1 1-1h4a1 1 0 0 1 1 1v2" />
    </svg>
  );
}
