'use client';

import Link from 'next/link';
import { HASH_ROUTING, hrefFor, useNav } from './nav';
import { useState } from 'react';
import { useApp } from './AppProviders';
import { BrandLogo } from '@/features/brand/BrandLogo';
import { brandConfig } from '@/features/brand/brand';
import { LoginScreen } from './LoginScreen';
import { VerifyEmailScreen } from './VerifyEmailScreen';
import { SIMULATED_MAILBOX } from '@/services';
import { cn } from '@/shared/utils/cn';
import { ConfirmButton } from '@/shared/components/ConfirmButton';
import { enabledModules, showModuleTitles } from '@/modules/registry';

/**
 * Coquille de l'application : barre latérale construite depuis le registre
 * des modules (src/modules/registry.js). Un titre par module n'apparaît
 * qu'à partir de deux modules actifs. Reprend la structure de AdminSidebar
 * (Trendl) sans ses ~40 entrées CRM / recouvrement / système.
 */

const ICONS = {
  spark: <path d="m12 3 1.9 5.6L19.5 10l-5.6 1.9L12 17.5l-1.9-5.6L4.5 10l5.6-1.4z" />,
  mail: (
    <>
      <rect x="3" y="5" width="18" height="14" rx="2" />
      <path d="m3 7 9 6 9-6" />
    </>
  ),
  check: (
    <>
      <rect x="4" y="4" width="16" height="16" rx="3" />
      <path d="m8.5 12 2.5 2.5 4.5-5" />
    </>
  ),
};

function NavIcon({ name }) {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      {ICONS[name]}
    </svg>
  );
}

export function AppShell({ children }) {
  const { user, mode, service } = useApp();
  const { view } = useNav();
  const [open, setOpen] = useState(false);
  // Barre latérale réduite (appearance.sidebar = collapsed) : icônes seules, dépliable à la demande.
  const [collapsed, setCollapsed] = useState(brandConfig.appearance.sidebar === 'collapsed');

  if (user === undefined) {
    return <div className="flex min-h-screen items-center justify-center text-sm text-muted">Chargement…</div>;
  }
  if (!user) return <LoginScreen />;
  if (mode === 'firebase' && user.emailVerified === false) return <VerifyEmailScreen />;

  const isActive = (v) => v === view;
  const NavLink = HASH_ROUTING ? 'a' : Link;

  const renderNav = (compact) => (
    <nav aria-label="Navigation principale" className="flex flex-col gap-4">
      {enabledModules().map((mod) => (
        <div key={mod.id} className="flex flex-col gap-1">
          {showModuleTitles() && !compact && (
            <p className="px-3 text-[10px] font-semibold uppercase tracking-wider text-muted">{mod.label}</p>
          )}
          {mod.nav.map((item) => (
            <NavLink
              key={item.view}
              href={hrefFor(item.view)}
              onClick={() => setOpen(false)}
              aria-current={isActive(item.view) ? 'page' : undefined}
              title={compact ? item.label : undefined}
              className={cn(
                'flex items-center gap-3 rounded-lg py-2 text-sm font-medium transition-colors',
                compact ? 'justify-center px-2' : 'px-3',
                isActive(item.view) ? 'bg-primary text-primary-foreground' : 'text-muted hover:bg-elevated hover:text-foreground'
              )}
            >
              <NavIcon name={item.icon} />
              <span className={compact ? 'sr-only' : undefined}>{item.label}</span>
            </NavLink>
          ))}
        </div>
      ))}
    </nav>
  );

  const footer = (
    <div className="mt-auto space-y-2 border-t border-border pt-3 text-xs text-muted">
      {(mode === 'demo' || SIMULATED_MAILBOX) && (
        <div className="rounded-lg border border-border bg-elevated px-2.5 py-2">
          <p className="font-semibold text-foreground">Mode démonstration</p>
          <p>{SIMULATED_MAILBOX ? 'E-mails fictifs, IA réelle, rien n’est envoyé.' : 'Données fictives, rien n’est envoyé.'}</p>
          <div className="mt-1">
            <ConfirmButton
              onConfirm={() => service.resetDemo()}
              confirmLabel="Oui, réinitialiser"
              confirmClassName="rounded-md bg-primary px-2 py-1 text-xs font-semibold text-primary-foreground"
              className="font-semibold text-link hover:underline"
            >
              Réinitialiser la démo
            </ConfirmButton>
          </div>
        </div>
      )}
      {mode === 'firebase' && !SIMULATED_MAILBOX && <MailboxConnection service={service} />}
      <p className="truncate" title={user.email}>{user.displayName || user.email}</p>
      <button type="button" onClick={() => service.signOut()} className="font-semibold text-foreground hover:underline">
        Se déconnecter
      </button>
    </div>
  );

  return (
    <div className="flex min-h-screen flex-col lg:flex-row">
      {/* Mobile : barre du haut + tiroir */}
      <header className="flex h-14 items-center justify-between border-b border-border bg-surface px-3 lg:hidden">
        <BrandLogo />
        <button
          type="button"
          onClick={() => setOpen((v) => !v)}
          aria-expanded={open}
          aria-label="Menu"
          className="flex h-10 w-10 items-center justify-center rounded-lg text-foreground hover:bg-elevated"
        >
          ☰
        </button>
      </header>
      {open && (
        <div className="fixed inset-0 z-40 bg-black/40 lg:hidden" onClick={() => setOpen(false)} role="presentation">
          <aside
            className="flex h-full w-64 flex-col gap-4 bg-surface p-4"
            onClick={(e) => e.stopPropagation()}
            role="presentation"
          >
            <BrandLogo />
            {renderNav(false)}
            {footer}
          </aside>
        </div>
      )}
      {/* Desktop : barre latérale fixe */}
      <aside
        className={cn(
          'sticky top-0 hidden h-screen shrink-0 flex-col gap-6 border-r border-border bg-surface lg:flex',
          collapsed ? 'w-16 items-center px-2 py-4' : 'w-56 p-4'
        )}
      >
        <div className={collapsed ? undefined : 'px-1'}>
          <BrandLogo compact={collapsed} />
          {brandConfig.client.isFictional && !collapsed && (
            <p className="mt-1 text-[10px] uppercase tracking-wider text-muted">Exemple fictif</p>
          )}
        </div>
        {renderNav(collapsed)}
        {collapsed ? <div className="mt-auto" /> : footer}
        <button
          type="button"
          onClick={() => setCollapsed((v) => !v)}
          aria-expanded={!collapsed}
          aria-label={collapsed ? 'Déplier la barre latérale' : 'Réduire la barre latérale'}
          title={collapsed ? 'Déplier' : 'Réduire'}
          className="self-center rounded-lg px-2 py-1 text-xs text-muted hover:bg-elevated hover:text-foreground"
        >
          {collapsed ? '»' : '«'}
        </button>
      </aside>
      <div className="flex min-w-0 flex-1 flex-col">{children}</div>
    </div>
  );
}

/**
 * Raccordement de la boîte Gmail (mode réel uniquement) : autorisation
 * Google, puis activation de la réception. Mécanisme technique conservé de
 * Trendl, rangé dans un petit menu pour ne pas créer de rubrique métier.
 */
function MailboxConnection({ service }) {
  const [msg, setMsg] = useState('');
  return (
    <details className="rounded-lg border border-border px-2.5 py-2">
      <summary className="cursor-pointer font-semibold text-foreground">Connexion de la messagerie</summary>
      <div className="mt-2 flex flex-col items-start gap-1.5">
        <button type="button" className="font-semibold text-link hover:underline" onClick={() => service.connectMailbox().catch((e) => setMsg(e.message))}>
          1. Autoriser l’accès Gmail
        </button>
        <button
          type="button"
          className="font-semibold text-link hover:underline"
          onClick={() =>
            service
              .startReception()
              .then((r) => setMsg(`Réception active jusqu’au ${new Date(r.expiration).toLocaleDateString('fr-FR')} (renouvelée chaque jour).`))
              .catch((e) => setMsg(e.message))
          }
        >
          2. Activer la réception
        </button>
        {msg && <p role="status">{msg}</p>}
      </div>
    </details>
  );
}
