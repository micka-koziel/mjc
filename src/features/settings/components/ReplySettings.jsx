'use client';

import { useState } from 'react';
import { Button } from '@/shared/components/Button';
import { REPLY_OPTIONS, normalizeReplies } from '@/features/settings/lib/assistant-settings';
import { Field, Section } from './SettingsParts';

const TEXTS = [
  ['instructions', 'Consignes d’écriture', 'Ex. : paragraphes très courts, une idée par paragraphe, va droit au fait…', 6],
  ['forbiddenTerms', 'Expressions à ne jamais utiliser', 'Une par ligne.', 5],
  ['signatureText', 'Signature', 'Vide = pas de signature imposée.', 4],
];

/** Onglet « Réponses » : ce qui guide les brouillons d’e-mails. */
export function ReplySettings({ settings, onSave }) {
  const [r, setR] = useState(settings.replies);
  const [busy, setBusy] = useState(false);
  const set = (patch) => setR((prev) => ({ ...prev, ...patch }));

  async function save() {
    setBusy(true);
    try {
      await onSave('replies', normalizeReplies(r));
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="space-y-4">
      <Section title="Style des brouillons" hint="Les brouillons d’e-mails sont écrits dans votre style, pas dans celui de l’assistante.">
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
          {Object.entries(REPLY_OPTIONS).map(([key, options]) => (
            <Field key={key} label={{ tone: 'Ton', concision: 'Longueur', language: 'Langue', formality: 'Vouvoiement / tutoiement' }[key]}>
              <div className="flex flex-wrap gap-1.5">
                {Object.entries(options).map(([value, label]) => (
                  <button
                    key={value}
                    type="button"
                    aria-pressed={r[key] === value}
                    onClick={() => set({ [key]: value })}
                    className={
                      r[key] === value
                        ? 'rounded-lg bg-primary px-3 py-1.5 text-sm font-medium text-primary-foreground'
                        : 'rounded-lg border border-border px-3 py-1.5 text-sm text-foreground hover:bg-elevated'
                    }
                  >
                    {label}
                  </button>
                ))}
              </div>
            </Field>
          ))}
        </div>
      </Section>

      {TEXTS.map(([key, title, hint, rows]) => (
        <Section key={key} title={title} hint={hint}>
          <textarea
            value={r[key]}
            onChange={(e) => set({ [key]: e.target.value })}
            rows={rows}
            maxLength={4000}
            className="w-full rounded-lg border border-border bg-background p-3 text-sm text-foreground"
          />
        </Section>
      ))}

      <div className="flex flex-wrap gap-2">
        <Button onClick={save} isLoading={busy}>Enregistrer les réponses</Button>
        <Button variant="ghost" onClick={() => setR(settings.start.replies)}>Revenir aux valeurs de départ</Button>
      </div>
    </div>
  );
}
