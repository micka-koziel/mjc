'use client';

import { useState } from 'react';
import { Button } from '@/shared/components/Button';
import {
  CATEGORY_LABELS,
  FRESH_LABELS,
  SENDER_LEVELS,
  normalizePriorities,
} from '@/features/settings/lib/assistant-settings';
import { Field, NumberField, Section } from './SettingsParts';

/**
 * Onglet « Priorités » : tout l'algorithme de la liste « À traiter »,
 * visible et modifiable (repris de « Priorités d'Alfred » dans Trendl,
 * sans les critères CRM).
 */
export function PrioritySettings({ settings, onSave }) {
  const [p, setP] = useState(settings.priorities);
  const [newSender, setNewSender] = useState({ match: '', level: 'important' });
  const [newKeyword, setNewKeyword] = useState('');
  const [busy, setBusy] = useState(false);
  const set = (patch) => setP((prev) => ({ ...prev, ...patch }));
  const setIn = (key, sub, value) => setP((prev) => ({ ...prev, [key]: { ...prev[key], [sub]: value } }));

  function addSender(e) {
    e.preventDefault();
    const match = newSender.match.trim().toLowerCase();
    if (match.length < 3 || p.senders.some((s) => s.match === match)) return;
    set({ senders: [...p.senders, { match, level: newSender.level }] });
    setNewSender({ match: '', level: newSender.level });
  }
  function addKeyword(e) {
    e.preventDefault();
    const k = newKeyword.trim().toLowerCase();
    if (k.length < 3 || p.keywords.includes(k)) return;
    set({ keywords: [...p.keywords, k] });
    setNewKeyword('');
  }
  async function save() {
    setBusy(true);
    try {
      await onSave('priorities', normalizePriorities(p));
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="space-y-4">
      <Section
        title="Consignes de priorité pour l’assistante"
        hint="En toutes lettres : ce qui doit remonter en tête. L’IA s’en sert pour marquer un e-mail « prioritaire » à son arrivée."
      >
        <textarea
          value={p.aiRules}
          onChange={(e) => set({ aiRules: e.target.value })}
          rows={5}
          maxLength={4000}
          placeholder="Ex. : les réclamations clients, les commandes en cours avec une date de livraison, les retards fournisseurs…"
          className="w-full rounded-lg border border-border bg-background p-3 text-sm text-foreground"
        />
      </Section>

      <Section title="Expéditeurs" hint="Une personne, une entreprise ou un domaine (ex. « annie do », « @cabinet-frappart.fr »). Le niveau ajoute ou retire des points.">
        <ul className="divide-y divide-border rounded-xl border border-border">
          {p.senders.length === 0 && <li className="px-3 py-2 text-sm text-muted">Aucun expéditeur réglé.</li>}
          {p.senders.map((s, i) => (
            <li key={s.match} className="flex items-center gap-3 px-3 py-2">
              <span className="min-w-0 flex-1 truncate text-sm text-foreground">{s.match}</span>
              <select
                value={s.level}
                onChange={(e) => set({ senders: p.senders.map((x, j) => (j === i ? { ...x, level: e.target.value } : x)) })}
                aria-label={`Niveau de ${s.match}`}
                className="h-9 rounded-lg border border-border bg-background px-2 text-sm text-foreground"
              >
                {SENDER_LEVELS.map((l) => (
                  <option key={l.key} value={l.key}>{l.label}</option>
                ))}
              </select>
              <button type="button" onClick={() => set({ senders: p.senders.filter((_, j) => j !== i) })} className="text-xs font-semibold text-danger hover:underline">
                Retirer
              </button>
            </li>
          ))}
        </ul>
        <form onSubmit={addSender} className="mt-2 flex flex-wrap gap-2">
          <input
            value={newSender.match}
            onChange={(e) => setNewSender({ ...newSender, match: e.target.value })}
            placeholder="Nom, entreprise ou domaine"
            aria-label="Nouvel expéditeur"
            className="h-9 min-w-[12rem] flex-1 rounded-lg border border-border bg-background px-3 text-sm text-foreground"
          />
          <select
            value={newSender.level}
            onChange={(e) => setNewSender({ ...newSender, level: e.target.value })}
            aria-label="Niveau du nouvel expéditeur"
            className="h-9 rounded-lg border border-border bg-background px-2 text-sm text-foreground"
          >
            {SENDER_LEVELS.map((l) => (
              <option key={l.key} value={l.key}>{l.label}</option>
            ))}
          </select>
          <Button type="submit" variant="secondary" size="sm">Ajouter</Button>
        </form>
        <div className="mt-3 grid grid-cols-3 gap-2">
          {SENDER_LEVELS.map((l) => (
            <NumberField key={l.key} label={`Points « ${l.label} »`} value={p.levelWeights[l.key]} onChange={(v) => setIn('levelWeights', l.key, v)} />
          ))}
        </div>
      </Section>

      <Section title="Mots-clés prioritaires" hint="Cherchés dans l’objet et le texte du dernier message reçu (sans tenir compte des accents ni des majuscules).">
        <div className="flex flex-wrap gap-2">
          {p.keywords.length === 0 && <span className="text-sm text-muted">Aucun mot-clé.</span>}
          {p.keywords.map((k) => (
            <span key={k} className="flex items-center gap-1 rounded-full border border-border bg-elevated px-3 py-1 text-sm text-foreground">
              {k}
              <button type="button" aria-label={`Retirer ${k}`} onClick={() => set({ keywords: p.keywords.filter((x) => x !== k) })} className="text-muted hover:text-danger">×</button>
            </span>
          ))}
        </div>
        <form onSubmit={addKeyword} className="mt-2 flex flex-wrap items-end gap-2">
          <input
            value={newKeyword}
            onChange={(e) => setNewKeyword(e.target.value)}
            placeholder="Ex. réclamation"
            aria-label="Nouveau mot-clé"
            className="h-9 min-w-[12rem] flex-1 rounded-lg border border-border bg-background px-3 text-sm text-foreground"
          />
          <Button type="submit" variant="secondary" size="sm">Ajouter</Button>
          <NumberField label="Points par mot-clé" value={p.keywordBonus} onChange={(v) => set({ keywordBonus: v })} />
        </form>
      </Section>

      <Section title="Barème" hint="Le score de chaque élément est la somme de ces points. Les plus hauts scores passent en tête.">
        <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
          <NumberField label="E-mail à répondre" value={p.familyWeights.reply} onChange={(v) => setIn('familyWeights', 'reply', v)} />
          <NumberField label="Tâche du jour" value={p.familyWeights.todo} onChange={(v) => setIn('familyWeights', 'todo', v)} />
          <NumberField label="Action attendue (IA)" value={p.expectedActionBonus} onChange={(v) => set({ expectedActionBonus: v })} />
          <NumberField label="Prioritaire (IA)" value={p.urgentBonus} onChange={(v) => set({ urgentBonus: v })} />
        </div>
        <p className="mt-3 text-xs font-semibold text-foreground">Fraîcheur du dernier message reçu</p>
        <div className="mt-1 grid grid-cols-2 gap-2 sm:grid-cols-4">
          {Object.entries(FRESH_LABELS).map(([k, label]) => (
            <NumberField key={k} label={label} value={p.fresh[k]} onChange={(v) => setIn('fresh', k, v)} />
          ))}
        </div>
        <p className="mt-3 text-xs font-semibold text-foreground">Tâches en retard</p>
        <div className="mt-1 grid grid-cols-2 gap-2 sm:grid-cols-4">
          <NumberField label="Points par jour de retard" value={p.agePerDay} onChange={(v) => set({ agePerDay: v })} />
          <NumberField label="Plafond" value={p.ageMax} onChange={(v) => set({ ageMax: v })} />
        </div>
      </Section>

      <Section title="Affichage">
        <div className="flex flex-wrap items-end gap-4">
          <NumberField label="Éléments affichés (3 à 30)" value={p.maxItems} onChange={(v) => set({ maxItems: v })} />
          <Field label="Ne jamais afficher">
            <div className="flex flex-wrap gap-3">
              {Object.entries(CATEGORY_LABELS).map(([k, label]) => (
                <label key={k} className="flex items-center gap-1.5 text-sm text-foreground">
                  <input
                    type="checkbox"
                    checked={p.excludedCategories.includes(k)}
                    onChange={(e) =>
                      set({ excludedCategories: e.target.checked ? [...p.excludedCategories, k] : p.excludedCategories.filter((c) => c !== k) })
                    }
                  />
                  {label}
                </label>
              ))}
            </div>
          </Field>
        </div>
      </Section>

      <div className="flex flex-wrap gap-2">
        <Button onClick={save} isLoading={busy}>Enregistrer les priorités</Button>
        <Button variant="ghost" onClick={() => setP(settings.start.priorities)}>Revenir aux valeurs de départ</Button>
      </div>
    </div>
  );
}
