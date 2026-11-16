'use client';

import { MAILBOX_FOLDERS } from '@/features/mailbox/lib/compute-folder';
import { cn } from '@/shared/utils/cn';

const ICONS = {
  inbox: '📥',
  spam: '🚫',
  archive: '📁',
  sent: '📤',
  trash: '🗑️',
};

/**
 * FolderNav — Navigation par dossiers (folders Gmail-like).
 *
 * Sprint 26 PR0 — refonte compact + sticky :
 *  - Prop `display: 'both' | 'mobile' | 'desktop'` (default 'both') permet
 *    de ne rendre qu'une variante. MailboxShell utilise display="desktop"
 *    dans la sidebar gauche et display="mobile" en sticky top de la
 *    section ThreadList (pour que les chips folders restent visibles en
 *    scroll de la liste de mails).
 *  - Padding compacté (p-3 → p-2, items px-2.5 py-1.5) pour gagner de la
 *    largeur sur la colonne 1 desktop (passée de lg:w-56 à lg:w-44).
 *
 * Sprint 20 PR1 (original) :
 *  - Desktop : colonne fixe à gauche, items verticaux avec count.
 *  - Mobile : barre horizontale scrollable (folders en chips).
 *
 * @param {object} props
 * @param {string} props.activeFolder ID du folder courant
 * @param {(id: string) => void} props.onSelect Callback de sélection
 * @param {Record<string, number>} [props.counts={}] Counts par folder
 * @param {'both'|'mobile'|'desktop'} [props.display='both']
 */
export function FolderNav({
  activeFolder,
  onSelect,
  counts = {},
  display = 'both',
}) {
  const showMobile = display === 'both' || display === 'mobile';
  const showDesktop = display === 'both' || display === 'desktop';
  // Si on force une variante, on retire les classes responsive lg:* qui
  // la cachaient dans certains breakpoints.
  const forced = display !== 'both';

  return (
    <nav
      aria-label="Dossiers Mailbox"
      className={cn(
        'bg-surface',
        showDesktop ? 'border-border lg:border-r' : '',
      )}
    >
      {/* Mobile : chips horizontaux scrollables */}
      {showMobile && (
        <ul
          className={cn(
            'flex gap-2 overflow-x-auto p-2',
            forced ? 'flex' : 'lg:hidden',
          )}
          role="tablist"
        >
          {MAILBOX_FOLDERS.map((f) => {
            const isActive = f.id === activeFolder;
            const count = counts[f.id] || 0;
            return (
              <li key={f.id} className="shrink-0">
                <button
                  type="button"
                  role="tab"
                  aria-selected={isActive}
                  onClick={() => onSelect(f.id)}
                  className={cn(
                    'flex h-9 items-center gap-1.5 rounded-full border px-2.5 text-sm font-medium transition-colors',
                    isActive
                      ? 'border-primary bg-primary/15 text-foreground'
                      : 'border-border bg-elevated/40 text-muted hover:text-foreground',
                  )}
                >
                  <span aria-hidden="true">{ICONS[f.id]}</span>
                  <span>{f.label}</span>
                  {count > 0 && (
                    <span
                      className={cn(
                        'rounded-full px-1.5 text-xs',
                        isActive ? 'bg-primary/30' : 'bg-elevated',
                      )}
                    >
                      {count}
                    </span>
                  )}
                </button>
              </li>
            );
          })}
        </ul>
      )}

      {/* Desktop : liste verticale compacte */}
      {showDesktop && (
        <ul
          className={cn(
            'flex-col gap-0.5 p-2',
            forced ? 'flex' : 'hidden lg:flex',
          )}
          role="tablist"
        >
          {MAILBOX_FOLDERS.map((f) => {
            const isActive = f.id === activeFolder;
            const count = counts[f.id] || 0;
            return (
              <li key={f.id}>
                <button
                  type="button"
                  role="tab"
                  aria-selected={isActive}
                  onClick={() => onSelect(f.id)}
                  className={cn(
                    'flex w-full items-center justify-between rounded-lg px-2.5 py-1.5 text-left text-sm font-medium transition-colors',
                    isActive
                      ? 'bg-primary/15 text-foreground'
                      : 'text-muted hover:bg-elevated/40 hover:text-foreground',
                  )}
                >
                  <span className="flex min-w-0 items-center gap-2">
                    <span aria-hidden="true">{ICONS[f.id]}</span>
                    <span className="truncate">{f.label}</span>
                  </span>
                  {count > 0 && (
                    <span
                      className={cn(
                        'ml-1 shrink-0 rounded-full px-1.5 py-0.5 text-xs',
                        isActive ? 'bg-primary/30' : 'bg-elevated text-muted',
                      )}
                    >
                      {count}
                    </span>
                  )}
                </button>
              </li>
            );
          })}
        </ul>
      )}
    </nav>
  );
}
