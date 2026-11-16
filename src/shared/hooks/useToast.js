'use client';

/**
 * useToast — Hook public pour afficher un toast depuis n'importe quel composant.
 *
 * @example
 *   const { showToast } = useToast();
 *   showToast({ message: 'Créateur enregistré', variant: 'success' });
 *   showToast({ message: 'Erreur réseau', variant: 'error' });
 *
 * Variants disponibles : 'success' | 'error' | 'info'
 * Durée par défaut : 4000ms (4s)
 */

import { useToastContext } from '@/shared/components/ToastProvider';

export function useToast() {
  return useToastContext();
}
