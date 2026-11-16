'use client';

/**
 * ToastProvider — Système de notifications transitoires (toasts).
 *
 * Monté une seule fois au niveau du RootLayout (src/app/layout.js).
 * Tous les composants enfants peuvent déclencher un toast via le hook useToast.
 *
 * Architecture :
 *  - ToastProvider maintient une queue de toasts en state
 *  - Chaque toast s'auto-détruit après `duration` ms
 *  - La liste est rendue en position fixed bas-droite
 */

import { createContext, useCallback, useContext, useState } from 'react';
import { cn } from '@/shared/utils/cn';

const ToastContext = createContext({ showToast: () => {} });

// Compteur global d'ID — incrémente à chaque toast créé
let nextToastId = 0;

const VARIANT_CLASSES = {
  success: 'border-success/40 bg-success/15 text-success',
  error: 'border-danger/40 bg-danger/15 text-danger',
  info: 'border-primary/40 bg-primary/15 text-link',
};

export function ToastProvider({ children }) {
  const [toasts, setToasts] = useState([]);

  const removeToast = useCallback((id) => {
    setToasts((prev) => prev.filter((t) => t.id !== id));
  }, []);

  const showToast = useCallback(
    ({ message, variant = 'info', duration = 4000 }) => {
      const id = ++nextToastId;
      setToasts((prev) => [...prev, { id, message, variant }]);
      // Auto-dismiss
      setTimeout(() => removeToast(id), duration);
    },
    [removeToast]
  );

  return (
    <ToastContext.Provider value={{ showToast }}>
      {children}
      <div
        aria-live="polite"
        aria-atomic="true"
        className="pointer-events-none fixed bottom-24 right-4 z-50 flex flex-col gap-2"
      >
        {toasts.map((t) => (
          <div
            key={t.id}
            role="alert"
            className={cn(
              'pointer-events-auto min-w-[260px] max-w-md rounded-xl border px-4 py-3 text-sm shadow-lg backdrop-blur-sm',
              VARIANT_CLASSES[t.variant]
            )}
          >
            {t.message}
          </div>
        ))}
      </div>
    </ToastContext.Provider>
  );
}

/**
 * Hook interne. Préférer useToast() depuis @/shared/hooks/useToast pour l'usage applicatif.
 */
export function useToastContext() {
  return useContext(ToastContext);
}
