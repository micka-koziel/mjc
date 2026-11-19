'use client';

import { useState } from 'react';
import { useApp } from '@/app-shell/AppProviders';
import { brandConfig } from '@/features/brand/brand';
import { AssistantAvatar } from '@/features/assistant/components/AssistantAvatar';
import { useToast } from '@/shared/hooks/useToast';
import { cn } from '@/shared/utils/cn';
import { PrioritySettings } from './PrioritySettings';
import { ReplySettings } from './ReplySettings';

const TABS = [
  { id: 'priorities', label: 'Priorités' },
  { id: 'replies', label: 'Réponses' },
];

/** Écran « Réglages » de l’assistante : priorités et réponses. */
export function SettingsPage() {
  const { assistantSettings } = useApp();
  const { showToast } = useToast();
  const [tab, setTab] = useState('priorities');
  const name = brandConfig.assistant.name;

  async function onSave(kind, value) {
    try {
      await assistantSettings.save(kind, value);
      showToast({ message: 'Réglages enregistrés. Pris en compte par l’IA dans la minute.', variant: 'success' });
    } catch (err) {
      showToast({ message: err.message || 'Enregistrement impossible.', variant: 'error' });
    }
  }

  return (
    <main className="flex flex-col gap-4 p-4 lg:p-6">
      <header className="flex items-center gap-3">
        <AssistantAvatar size="md" />
        <div>
          <h1 className="text-xl font-semibold text-foreground">Réglages de {name}</h1>
          <p className="text-sm text-muted">Ce qu’elle met en priorité et comment elle prépare vos réponses. Aucune règle cachée.</p>
        </div>
      </header>

      <div role="tablist" aria-label="Réglages" className="flex gap-1 border-b border-border">
        {TABS.map((t) => (
          <button
            key={t.id}
            role="tab"
            type="button"
            aria-selected={tab === t.id}
            onClick={() => setTab(t.id)}
            className={cn(
              '-mb-px border-b-2 px-4 py-2 text-sm font-medium',
              tab === t.id ? 'border-primary text-foreground' : 'border-transparent text-muted hover:text-foreground'
            )}
          >
            {t.label}
            {assistantSettings.customized[t.id] && <span className="ml-1 text-xs text-muted">(modifié)</span>}
          </button>
        ))}
      </div>

      <div className="max-w-4xl">
        {tab === 'priorities' ? (
          <PrioritySettings key={JSON.stringify(assistantSettings.priorities)} settings={assistantSettings} onSave={onSave} />
        ) : (
          <ReplySettings key={JSON.stringify(assistantSettings.replies)} settings={assistantSettings} onSave={onSave} />
        )}
      </div>
    </main>
  );
}
