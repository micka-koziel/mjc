'use client';

import { useEffect, useState } from 'react';

/**
 * Confirmation en deux temps, dans la page (sans window.confirm, refusé
 * dans certains cadres d'affichage et peu lisible) : 1er clic → « Confirmer
 * ? » + « Annuler » ; l'état revient seul au bout de 6 s.
 */
export function ConfirmButton({ onConfirm, children, confirmLabel = 'Confirmer', className = '', confirmClassName = '', disabled = false, ariaLabel }) {
  const [armed, setArmed] = useState(false);
  useEffect(() => {
    if (!armed) return undefined;
    const t = setTimeout(() => setArmed(false), 6000);
    return () => clearTimeout(t);
  }, [armed]);
  if (!armed) {
    return (
      <button type="button" className={className} disabled={disabled} aria-label={ariaLabel} onClick={() => setArmed(true)}>
        {children}
      </button>
    );
  }
  return (
    <span className="inline-flex items-center gap-1.5">
      <button
        type="button"
        className={confirmClassName || 'rounded-md bg-danger px-2 py-1 text-xs font-semibold text-danger-foreground'}
        onClick={() => {
          setArmed(false);
          onConfirm();
        }}
      >
        {confirmLabel}
      </button>
      <button type="button" className="rounded-md px-2 py-1 text-xs text-muted hover:text-foreground" onClick={() => setArmed(false)}>
        Annuler
      </button>
    </span>
  );
}
