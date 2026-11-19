'use client';

import { createContext, useContext, useEffect, useMemo, useState } from 'react';
import { ToastProvider } from '@/shared/components/ToastProvider';
import { getMailService, DATA_MODE } from '@/services';
import { groupByThread } from '@/features/mailbox/lib/threads';
import { brandConfig } from '@/features/brand/brand';
import { normalizePriorities, normalizeReplies } from '@/features/settings/lib/assistant-settings';

const AppContext = createContext(null);

/**
 * Fournit à toute l'application : le service de données (démo ou réel),
 * l'utilisateur connecté, les messages (temps réel) et les tâches.
 * Un seul abonnement par type de donnée, partagé par les trois écrans.
 */
export function AppProviders({ children }) {
  const [service, setService] = useState(null);
  const [user, setUser] = useState(undefined);
  const [mail, setMail] = useState({ messages: [], loading: true, error: null });
  const [todoState, setTodoState] = useState({ todos: [], loading: true });
  const [initError, setInitError] = useState(null);
  // Réglages de l'assistant : enregistrés (null si jamais modifiés) + valeurs de départ.
  const [settingsRaw, setSettingsRaw] = useState({ priorities: null, replies: null, defaults: {} });

  useEffect(() => {
    let alive = true;
    getMailService()
      .then((s) => alive && setService(s))
      .catch((err) => alive && setInitError(err));
    return () => {
      alive = false;
    };
  }, []);

  useEffect(() => (service ? service.onAuth(setUser) : undefined), [service]);

  useEffect(() => {
    // Adresse non vérifiée : les règles d'accès refuseraient la lecture.
    if (!service || !user || user.emailVerified === false) return undefined;
    const u1 = service.subscribeMessages(setMail);
    const u2 = service.subscribeTodos(setTodoState);
    return () => {
      u1?.();
      u2?.();
    };
  }, [service, user]);

  useEffect(() => {
    if (!service?.getAssistantSettings || !user || user.emailVerified === false) return undefined;
    let alive = true;
    service
      .getAssistantSettings()
      .then((s) => alive && setSettingsRaw({ priorities: null, replies: null, defaults: {}, ...s }))
      .catch(() => {});
    return () => {
      alive = false;
    };
  }, [service, user]);

  const threads = useMemo(() => groupByThread(mail.messages), [mail.messages]);

  // Valeurs de départ : questionnaire (expéditeurs importants, consignes), puis
  // ce que l'utilisatrice a enregistré dans l'écran Réglages.
  const assistantSettings = useMemo(() => {
    const d = settingsRaw.defaults || {};
    const senders = (d.importantSenders?.length ? d.importantSenders : brandConfig.priorities.importantSenders).map((match) => ({
      match,
      level: 'important',
    }));
    const startPriorities = normalizePriorities({}, { senders, aiRules: d.aiRules || '' });
    const startReplies = normalizeReplies({}, d.replies || brandConfig.assistant);
    return {
      priorities: normalizePriorities(settingsRaw.priorities || {}, startPriorities),
      replies: normalizeReplies(settingsRaw.replies || {}, startReplies),
      start: { priorities: startPriorities, replies: startReplies },
      customized: { priorities: Boolean(settingsRaw.priorities), replies: Boolean(settingsRaw.replies) },
      async save(kind, value) {
        const r = await service.saveAssistantSettings(kind, value);
        setSettingsRaw((prev) => ({ ...prev, [kind]: r.value }));
        return r;
      },
    };
  }, [settingsRaw, service]);

  const value = useMemo(
    () => ({ service, mode: DATA_MODE, user, ...mail, threads, todos: todoState.todos, todosLoading: todoState.loading, assistantSettings }),
    [service, user, mail, threads, todoState, assistantSettings]
  );

  if (initError) {
    return (
      <div className="m-8 rounded-xl border border-danger/40 bg-danger/10 p-4 text-sm text-danger">
        Démarrage impossible : {initError.message}
      </div>
    );
  }

  return (
    <AppContext.Provider value={value}>
      <ToastProvider>{children}</ToastProvider>
    </AppContext.Provider>
  );
}

export function useApp() {
  const ctx = useContext(AppContext);
  if (!ctx) throw new Error('useApp doit être utilisé sous <AppProviders>.');
  return ctx;
}
