'use client';

/**
 * Navigation entre les trois écrans.
 *
 * - Mode normal (application) : vraies adresses Next.js (/, /mailbox, /todos,
 *   /mailbox?thread=…).
 * - Mode « page unique » (NEXT_PUBLIC_HASH_ROUTING=1) : utilisé pour la démo
 *   exportée en fichiers statiques et partagée par lien. Une seule page,
 *   l'écran est porté par l'ancre (#mailbox, #todos) ; le fil à ouvrir est
 *   transmis en mémoire (une ancre de partage ne peut pas porter de
 *   paramètre).
 * Le choix est figé à la construction : les hooks appelés ne varient pas.
 */
import { useCallback, useEffect, useState } from 'react';
import { usePathname, useRouter, useSearchParams } from 'next/navigation';

export const HASH_ROUTING = process.env.NEXT_PUBLIC_HASH_ROUTING === '1';

const VIEWS = { home: '/', mailbox: '/mailbox', todos: '/todos' };

/** Lien vers un écran, selon le mode. */
export function hrefFor(view) {
  if (HASH_ROUTING) return view === 'home' ? '#' : `#${view}`;
  return VIEWS[view] || '/';
}

let pendingThread = null;
const listeners = new Set();

function viewFromHash() {
  if (typeof window === 'undefined') return 'home';
  const h = window.location.hash.replace(/^#/, '');
  return h === 'mailbox' || h === 'todos' ? h : 'home';
}

function useHashNav() {
  const [view, setView] = useState('home');
  const [thread, setThread] = useState(null);
  useEffect(() => {
    const sync = () => {
      setView(viewFromHash());
      setThread(pendingThread);
    };
    sync();
    window.addEventListener('hashchange', sync);
    listeners.add(sync);
    return () => {
      window.removeEventListener('hashchange', sync);
      listeners.delete(sync);
    };
  }, []);
  const openThread = useCallback((threadId) => {
    pendingThread = threadId;
    if (viewFromHash() === 'mailbox') listeners.forEach((l) => l());
    else window.location.hash = 'mailbox';
  }, []);
  const clearThread = useCallback(() => {
    pendingThread = null;
    setThread(null);
  }, []);
  return { view, threadParam: thread, openThread, clearThread };
}

function useRouterNav() {
  const pathname = usePathname();
  const router = useRouter();
  const searchParams = useSearchParams();
  const view = pathname?.startsWith('/mailbox')
    ? 'mailbox'
    : pathname?.startsWith('/todos')
      ? 'todos'
      : pathname?.startsWith('/reglages')
        ? 'settings'
        : 'home';
  const openThread = useCallback((threadId) => router.push(`/mailbox?thread=${encodeURIComponent(threadId)}`), [router]);
  const clearThread = useCallback(() => router.replace(pathname, { scroll: false }), [router, pathname]);
  return { view, threadParam: searchParams?.get('thread') || null, openThread, clearThread };
}

/** @returns {{view: 'home'|'mailbox'|'todos', threadParam: string|null, openThread: (id: string) => void, clearThread: () => void}} */
export const useNav = HASH_ROUTING ? useHashNav : useRouterNav;
