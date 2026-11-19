'use client';

import { useEffect, useState } from 'react';
import { Button } from '@/shared/components/Button';

/**
 * « Gérer les accès » (administrateur) : inviter une personne (compte créé,
 * e-mail pour choisir son mot de passe) ou lui retirer l'accès.
 */
export function AccessDialog({ service, onClose }) {
  const [people, setPeople] = useState(null);
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState(null);

  useEffect(() => {
    service
      .manageAccess('list')
      .then((r) => setPeople(r.people))
      .catch((e) => setMsg({ ok: false, text: e.message }));
  }, [service]);

  async function grant(e) {
    e.preventDefault();
    setBusy(true);
    setMsg(null);
    try {
      const r = await service.manageAccess('grant', { email, displayName: name });
      setPeople(r.people);
      await service.sendPasswordSetup(email.trim().toLowerCase());
      setMsg({ ok: true, text: `Accès donné. ${name || email} reçoit un e-mail pour choisir son mot de passe (penser aux spams).` });
      setName('');
      setEmail('');
    } catch (err) {
      setMsg({ ok: false, text: err.message });
    } finally {
      setBusy(false);
    }
  }

  async function revoke(person) {
    if (!window.confirm(`Retirer l’accès de ${person.displayName || person.email} ?`)) return;
    setBusy(true);
    setMsg(null);
    try {
      const r = await service.manageAccess('revoke', { email: person.email });
      setPeople(r.people);
      setMsg({ ok: true, text: 'Accès retiré.' });
    } catch (err) {
      setMsg({ ok: false, text: err.message });
    } finally {
      setBusy(false);
    }
  }

  async function resend(person) {
    setBusy(true);
    try {
      await service.sendPasswordSetup(person.email);
      setMsg({ ok: true, text: `E-mail renvoyé à ${person.displayName || person.email}.` });
    } catch (err) {
      setMsg({ ok: false, text: err.message });
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4" role="presentation" onClick={onClose}>
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby="access-title"
        className="w-full max-w-lg space-y-4 rounded-2xl border border-border bg-surface p-5 shadow-xl"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-start justify-between gap-4">
          <div>
            <h2 id="access-title" className="text-lg font-semibold text-foreground">Gérer les accès</h2>
            <p className="text-xs text-muted">La personne invitée reçoit un e-mail pour choisir son mot de passe.</p>
          </div>
          <button type="button" onClick={onClose} aria-label="Fermer" className="rounded-lg px-2 text-lg text-muted hover:bg-elevated">×</button>
        </div>

        <form onSubmit={grant} className="grid gap-2 sm:grid-cols-[1fr_1.4fr_auto]">
          <input value={name} onChange={(e) => setName(e.target.value)} placeholder="Prénom" aria-label="Prénom" className="h-10 rounded-lg border border-border bg-background px-3 text-sm text-foreground" />
          <input type="email" required value={email} onChange={(e) => setEmail(e.target.value)} placeholder="adresse@exemple.fr" aria-label="Adresse e-mail" className="h-10 rounded-lg border border-border bg-background px-3 text-sm text-foreground" />
          <Button type="submit" isLoading={busy}>Inviter</Button>
        </form>

        {msg && <p className={msg.ok ? 'text-sm text-success' : 'text-sm text-danger'}>{msg.text}</p>}

        <ul className="max-h-72 divide-y divide-border overflow-y-auto rounded-xl border border-border">
          {people === null && <li className="px-3 py-3 text-sm text-muted">Chargement…</li>}
          {people?.map((p) => (
            <li key={p.email} className="flex items-center justify-between gap-3 px-3 py-2">
              <div className="min-w-0">
                <p className="truncate text-sm font-medium text-foreground">
                  {p.displayName || p.email}
                  {p.admin && <span className="ml-2 text-[10px] uppercase tracking-wider text-muted">administrateur</span>}
                </p>
                <p className="truncate text-xs text-muted">
                  {p.email} · {p.lastSignIn ? `dernière connexion le ${new Date(p.lastSignIn).toLocaleDateString('fr-FR')}` : 'jamais connecté'}
                </p>
              </div>
              {!p.admin && (
                <div className="flex shrink-0 gap-3 text-xs font-semibold">
                  {!p.lastSignIn && (
                    <button type="button" disabled={busy} onClick={() => resend(p)} className="text-link hover:underline">Renvoyer</button>
                  )}
                  <button type="button" disabled={busy} onClick={() => revoke(p)} className="text-danger hover:underline">Retirer</button>
                </div>
              )}
            </li>
          ))}
        </ul>
      </div>
    </div>
  );
}
