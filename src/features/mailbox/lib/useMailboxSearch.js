'use client';

/**
 * useMailboxSearch — recherche étendue (reprise de Trendl, Sprint 97).
 *
 * La liste ne charge que les ~200 derniers messages. À partir de 3
 * caractères (après 500 ms sans frappe), on interroge aussi la messagerie
 * complète via le service (réel : Gmail — objet, corps, pièces jointes,
 * toutes dates ; démo : tous les messages fictifs), et les fils trouvés sont
 * ajoutés à la liste.
 */
import { useEffect, useState } from 'react';
import { useApp } from '@/app-shell/AppProviders';

const DEBOUNCE_MS = 500;
const MIN_LENGTH = 3;
const EMPTY = { threadIds: [], messages: [], searching: false };

export function useMailboxSearch(search) {
  const { service } = useApp();
  const q = String(search || '').trim();
  const active = q.length >= MIN_LENGTH && Boolean(service);
  const [state, setState] = useState({ q: '', ...EMPTY });

  useEffect(() => {
    if (!active) return undefined;
    let cancelled = false;
    const timer = setTimeout(async () => {
      setState({ q, ...EMPTY, searching: true });
      try {
        const { messages } = await service.searchMessages(q);
        const threadIds = [...new Set(messages.map((m) => m.threadId || m.id))];
        if (!cancelled) setState({ q, threadIds, messages, searching: false });
      } catch (err) {
        console.error('Recherche étendue en échec', err);
        if (!cancelled) setState({ q, ...EMPTY, error: err });
      }
    }, DEBOUNCE_MS);
    return () => {
      cancelled = true;
      clearTimeout(timer);
    };
  }, [q, active, service]);

  if (!active || state.q !== q) return { ...EMPTY, searching: active };
  return state;
}
