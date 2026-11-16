'use client';

import { useState } from 'react';
import { useApp } from './AppProviders';
import { BrandLogo } from '@/features/brand/BrandLogo';
import { Button } from '@/shared/components/Button';

/**
 * Connexion. Démo : un clic. Réel : e-mail + mot de passe Firebase Auth
 * (comptes créés par l'administrateur de l'instance, comme dans Trendl).
 */
export function LoginScreen() {
  const { service, mode } = useApp();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState(null);
  const [busy, setBusy] = useState(false);

  async function submit(e) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    try {
      await service.signIn({ email, password });
    } catch {
      setError('Connexion refusée : vérifiez l’adresse et le mot de passe.');
    } finally {
      setBusy(false);
    }
  }

  return (
    <main className="flex min-h-screen items-center justify-center p-4">
      <form onSubmit={submit} className="w-full max-w-sm space-y-4 rounded-2xl border border-border bg-surface p-6 shadow-sm">
        <BrandLogo />
        {mode === 'demo' ? (
          <Button type="submit" className="w-full" isLoading={busy}>
            Entrer dans la démonstration
          </Button>
        ) : (
          <>
            <label className="block text-sm">
              <span className="mb-1 block font-medium text-foreground">Adresse e-mail</span>
              <input type="email" required value={email} onChange={(e) => setEmail(e.target.value)} className="h-10 w-full rounded-lg border border-border bg-background px-3 text-foreground" />
            </label>
            <label className="block text-sm">
              <span className="mb-1 block font-medium text-foreground">Mot de passe</span>
              <input type="password" required value={password} onChange={(e) => setPassword(e.target.value)} className="h-10 w-full rounded-lg border border-border bg-background px-3 text-foreground" />
            </label>
            {error && <p className="text-sm text-danger">{error}</p>}
            <Button type="submit" className="w-full" isLoading={busy}>
              Se connecter
            </Button>
          </>
        )}
      </form>
    </main>
  );
}
