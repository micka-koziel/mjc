'use client';

import { createContext, useContext, useEffect, useMemo, useState } from 'react';
import { ToastProvider } from '@/shared/components/ToastProvider';
import { getMailService, DATA_MODE } from '@/services';
import { groupByThread } from '@/features/mailbox/lib/threads';

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
    if (!service || !user) return undefined;
    const u1 = service.subscribeMessages(setMail);
    const u2 = service.subscribeTodos(setTodoState);
    return () => {
      u1?.();
      u2?.();
    };
  }, [service, user]);

  const threads = useMemo(() => groupByThread(mail.messages), [mail.messages]);

  const value = useMemo(
    () => ({ service, mode: DATA_MODE, user, ...mail, threads, todos: todoState.todos, todosLoading: todoState.loading }),
    [service, user, mail, threads, todoState]
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
