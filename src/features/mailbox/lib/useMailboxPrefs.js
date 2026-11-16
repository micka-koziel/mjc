'use client';

import { useCallback, useEffect, useState } from 'react';

const STORAGE_KEY = 'khentik.mailbox.prefs.v1';

const DEFAULT_PREFS = {
  folder: 'inbox',
  search: '',
  threadId: null,
};

/**
 * useMailboxPrefs — Persistance des préférences UI Mailbox dans localStorage.
 *
 * Pattern Sprint 20 (cf feedback_pattern_i18n_context_localstorage) :
 *  - Hydration SSR-safe : lecture localStorage uniquement dans useEffect
 *    après mount. État initial = DEFAULT_PREFS pour éviter mismatch SSR.
 *  - Write-through : chaque setter écrit immédiatement dans localStorage.
 *  - Versionning de la clé (.v1) : si on change le schéma, on bump et les
 *    anciennes prefs sont ignorées (au lieu de planter).
 *
 * Sprint 23 PR2 — `threadId` n'est plus persisté dans localStorage. On garde
 * `folder` et `search` (utiles pour reprendre où on était), mais le mail
 * ouvert est éphémère — comme Gmail, Outlook ou Apple Mail. Évite le bug
 * où un mail consulté il y a une semaine restait auto-ouvert en arrière-plan
 * et masquait la liste sur mobile, ou se révélait par surprise quand le
 * drawer Résumé 12h se fermait.
 *
 * @returns {{prefs, setFolder, setSearch, setThreadId, hydrated}}
 */
export function useMailboxPrefs() {
  const [prefs, setPrefs] = useState(DEFAULT_PREFS);
  const [hydrated, setHydrated] = useState(false);

  // Hydration depuis localStorage (1 fois au mount, côté client uniquement).
  // Sprint 23 PR2 : on ne réhydrate QUE folder et search. threadId reste
  // éphémère (state React) et démarre à null à chaque visite.
  useEffect(() => {
    if (typeof window === 'undefined') return;
    try {
      const raw = window.localStorage.getItem(STORAGE_KEY);
      if (raw) {
        const parsed = JSON.parse(raw);
        // eslint-disable-next-line react-hooks/set-state-in-effect
        setPrefs((prev) => ({
          ...prev,
          folder: parsed.folder ?? prev.folder,
          search: parsed.search ?? prev.search,
          // threadId NON réhydraté (Sprint 23 PR2)
        }));
      }
    } catch (err) {
      // localStorage corrompu ou JSON invalide : on garde DEFAULT_PREFS
      console.warn('useMailboxPrefs: failed to read localStorage', err);
    }
    setHydrated(true);
  }, []);

  // persist écrit seulement folder + search dans localStorage.
  // threadId est gardé en state React (volatile, reset au reload).
  const persist = useCallback((next) => {
    setPrefs(next);
    if (typeof window === 'undefined') return;
    try {
      const { folder, search } = next;
      window.localStorage.setItem(
        STORAGE_KEY,
        JSON.stringify({ folder, search }),
      );
    } catch (err) {
      console.warn('useMailboxPrefs: failed to write localStorage', err);
    }
  }, []);

  const setFolder = useCallback(
    (folder) => persist({ ...prefs, folder, threadId: null }),
    [prefs, persist],
  );

  const setSearch = useCallback(
    (search) => persist({ ...prefs, search }),
    [prefs, persist],
  );

  const setThreadId = useCallback(
    (threadId) => persist({ ...prefs, threadId }),
    [prefs, persist],
  );

  // Sprint 91 — arrivée par deep-link (?thread=) : poser le dossier ET vider
  // la recherche mémorisée, en UNE écriture. Enchaîner setFolder puis
  // setSearch ne marcherait pas : les deux repartent du même `prefs` capturé,
  // donc le second écraserait le premier (le dossier serait perdu).
  const openThreadInFolder = useCallback(
    (folder, threadId) => persist({ ...prefs, folder, search: '', threadId }),
    [prefs, persist],
  );

  return { prefs, setFolder, setSearch, setThreadId, openThreadInFolder, hydrated };
}
