'use client';

import { useState } from 'react';
import { useApp } from './AppProviders';
import { BrandLogo } from '@/features/brand/BrandLogo';
import { Button } from '@/shared/components/Button';

/**
 * Adresse e-mail non vérifiée (mode réel) : les règles d'accès refusent les
 * données tant que l'adresse n'est pas confirmée. On envoie le lien, puis
 * la personne revient et confirme.
 */
export function VerifyEmailScreen() {
  const { service, user } = useApp();
  const [status, setStatus] = useState(null);
  const [busy, setBusy] = useState(false);

  async function send() {
    setBusy(true);
    try {
      await service.sendVerificationEmail();
      setStatus({ ok: true, text: `Lien envoyé à ${user.email}. Ouvrez-le, puis revenez ici.` });
    } catch {
      setStatus({ ok: false, text: 'Envoi impossible pour le moment. Réessayez dans une minute.' });
    } finally {
      setBusy(false);
    }
  }

  async function check() {
    setBusy(true);
    try {
      const ok = await service.refreshVerification();
      if (!ok) setStatus({ ok: false, text: 'Adresse pas encore confirmée : ouvrez le lien reçu par e-mail.' });
    } finally {
      setBusy(false);
    }
  }

  return (
    <main className="flex min-h-screen items-center justify-center p-4">
      <div className="w-full max-w-sm space-y-4 rounded-2xl border border-border bg-surface p-6 shadow-sm">
        <BrandLogo />
        <h1 className="text-lg font-semibold text-foreground">Confirmez votre adresse e-mail</h1>
        <p className="text-sm text-muted">
          Par sécurité, l’accès aux e-mails est réservé aux adresses confirmées. Une seule fois suffit.
        </p>
        <Button type="button" className="w-full" onClick={send} isLoading={busy}>
          M’envoyer le lien de confirmation
        </Button>
        <Button type="button" variant="secondary" className="w-full" onClick={check} disabled={busy}>
          J’ai confirmé, continuer
        </Button>
        {status && <p className={status.ok ? 'text-sm text-success' : 'text-sm text-danger'}>{status.text}</p>}
        <button type="button" onClick={() => service.signOut()} className="text-xs font-semibold text-muted hover:underline">
          Se déconnecter
        </button>
      </div>
    </main>
  );
}
