'use client';

import { useMemo, useState } from 'react';
import Link from 'next/link';
import { useApp } from '@/app-shell/AppProviders';
import { useToast } from '@/shared/hooks/useToast';
import { Button } from '@/shared/components/Button';
import { formatDateShort } from '@/shared/utils/format-date';
import { fold } from '@/shared/utils/text-fold';
import { TODO_KINDS, TODO_RECURRENCES } from '../lib/todo-schema';
import { todoDoneFields, todoDueState } from '../lib/todo-occurrence';

/**
 * To-do — reprise du module Trendl (Sprint 81) :
 *  - même modèle de données (collection `todos`, schéma todo-schema.js) ;
 *  - mêmes règles : ponctuelle (échéance, « fait » définitif) ou récurrente
 *    (quotidien → annuel, « fait » solde l'occurrence courante ; calcul
 *    todo-occurrence.js repris tel quel, avec ses tests) ;
 *  - mêmes colonnes (Tâche, Type, Échéance/ancre, Statut), même recherche
 *    (tâche + détail), mêmes contrôles de saisie.
 *
 * Adapté : le moteur générique de fiches de Trendl (_entity-framework, ~7 000
 * lignes, lié au CRM : listes liées, audit, propriétaires) est remplacé par
 * cet écran autonome. Retirée : la section « Propriétaire » (référentiel
 * utilisateurs du CRM). Ajouté : le lien vers l'e-mail d'origine.
 */

export function validateTodo(values) {
  // Règles reprises de todosConfig.validate (Trendl).
  if (!values.text?.trim()) return 'La tâche est obligatoire.';
  if (!values.todo_kind) return 'Choisissez un type : ponctuel ou récurrent.';
  if (values.todo_kind === 'Ponctuel' && !values.due_date) return 'Une tâche ponctuelle a besoin d’une échéance.';
  if (values.todo_kind === 'Récurrent') {
    if (!values.recurrence) return 'Choisissez la périodicité de la récurrence.';
    if (!values.anchor_date) return 'Indiquez la première échéance (l’ancre de la récurrence).';
  }
  if (values.link_url && !/^https?:\/\//i.test(values.link_url)) return 'Le lien doit commencer par http:// ou https://';
  return null;
}

const EMPTY = { text: '', details: '', link_url: '', todo_kind: 'Ponctuel', due_date: '', recurrence: '', anchor_date: '' };

export function TodosPage() {
  const { todos, todosLoading, service } = useApp();
  const { showToast } = useToast();
  const [search, setSearch] = useState('');
  const [editing, setEditing] = useState(null); // null | 'new' | todo
  const [showDone, setShowDone] = useState(false);
  const todayISO = new Date().toISOString().slice(0, 10);

  const rows = useMemo(() => {
    const q = fold(search);
    return todos
      .filter((t) => !q || fold(`${t.text} ${t.details || ''}`).includes(q))
      .filter((t) => showDone || !(t.todo_kind === 'Ponctuel' && t.done))
      .sort((a, b) => sortKey(a, todayISO).localeCompare(sortKey(b, todayISO)));
  }, [todos, search, showDone, todayISO]);

  async function markDone(t) {
    try {
      await service.updateTodo(t.id, todoDoneFields(t, todayISO));
      showToast({ message: t.todo_kind === 'Récurrent' ? 'Occurrence soldée.' : 'Tâche faite.', variant: 'success' });
    } catch (err) {
      showToast({ message: err.message, variant: 'error' });
    }
  }
  async function reopen(t) {
    await service.updateTodo(t.id, t.todo_kind === 'Récurrent' ? { last_done_occurrence: null } : { done: false });
  }
  async function remove(t) {
    if (!window.confirm(`Supprimer « ${t.text} » ?`)) return;
    await service.deleteTodo(t.id);
    showToast({ message: 'Tâche supprimée.', variant: 'success' });
  }

  return (
    <main className="flex flex-col gap-4 p-4 lg:p-6">
      <header className="flex flex-wrap items-center gap-3">
        <div className="mr-auto">
          <h1 className="text-xl font-semibold text-foreground">To-do</h1>
          <p className="text-sm text-muted">Tâches ponctuelles ou récurrentes, rappelées dans l’Assistant IA à leur échéance.</p>
        </div>
        <Button onClick={() => setEditing('new')}>+ Nouvelle tâche</Button>
      </header>

      <div className="flex flex-wrap items-center gap-3">
        <input
          type="search"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="Rechercher par tâche ou détail…"
          aria-label="Rechercher une tâche"
          className="h-10 w-full max-w-sm rounded-lg border border-border bg-surface px-3 text-sm text-foreground"
        />
        <label className="flex items-center gap-2 text-sm text-muted">
          <input type="checkbox" checked={showDone} onChange={(e) => setShowDone(e.target.checked)} className="accent-[var(--q-primary)]" />
          Afficher les tâches faites
        </label>
      </div>

      {editing && (
        <TodoForm
          initial={editing === 'new' ? EMPTY : editing}
          onCancel={() => setEditing(null)}
          onSubmit={async (values) => {
            try {
              if (editing === 'new') await service.createTodo({ ...values, done: false });
              else await service.updateTodo(editing.id, values);
              showToast({ message: 'Tâche enregistrée.', variant: 'success' });
              setEditing(null);
            } catch (err) {
              showToast({ message: `Enregistrement impossible : ${err.message}`, variant: 'error' });
            }
          }}
        />
      )}

      <div className="overflow-x-auto rounded-xl border border-border bg-surface">
        <table className="w-full text-left text-sm">
          <thead className="border-b border-border text-xs uppercase tracking-wider text-muted">
            <tr>
              <th className="px-3 py-2">Tâche</th>
              <th className="px-3 py-2">Type</th>
              <th className="px-3 py-2">Échéance / ancre</th>
              <th className="px-3 py-2">Statut</th>
              <th className="px-3 py-2"><span className="sr-only">Actions</span></th>
            </tr>
          </thead>
          <tbody>
            {todosLoading ? (
              <tr><td colSpan={5} className="px-3 py-6 text-center text-muted">Chargement…</td></tr>
            ) : rows.length === 0 ? (
              <tr><td colSpan={5} className="px-3 py-6 text-center text-muted">Aucune tâche. Cliquez sur « Nouvelle tâche » pour en créer une.</td></tr>
            ) : (
              rows.map((t) => {
                const due = todoDueState(t, todayISO);
                const isDone = t.todo_kind === 'Ponctuel' ? t.done : Boolean(t.last_done_occurrence) && !due.due;
                return (
                  <tr key={t.id} className="border-b border-border last:border-0">
                    <td className="row-pad px-3">
                      <button type="button" onClick={() => setEditing(t)} className="text-left font-medium text-foreground hover:underline">
                        {t.text || '—'}
                      </button>
                      {t.details && <p className="text-xs text-muted">{t.details}</p>}
                      {t.source_thread_id && (
                        <Link href={`/mailbox?thread=${encodeURIComponent(t.source_thread_id)}`} className="text-xs font-semibold text-link hover:underline">
                          E-mail lié : {t.source_subject || 'ouvrir'}
                        </Link>
                      )}
                      {t.link_url && (
                        <a href={t.link_url} target="_blank" rel="noreferrer" className="ml-2 text-xs text-link hover:underline">
                          Lien utile ↗
                        </a>
                      )}
                    </td>
                    <td className="px-3 text-muted">{t.todo_kind === 'Récurrent' ? `Récurrent · ${t.recurrence || '—'}` : t.todo_kind || 'À la volée'}</td>
                    <td className="px-3 text-muted">{formatDateShort(t.todo_kind === 'Récurrent' ? t.anchor_date : t.due_date) || '—'}</td>
                    <td className="px-3">
                      {due.due ? (
                        <span className="rounded-full bg-warning/15 px-2 py-0.5 text-[11px] font-medium text-warning">
                          {due.daysLate > 0 ? `En retard (${due.daysLate} j)` : 'À faire aujourd’hui'}
                        </span>
                      ) : isDone ? (
                        <span className="rounded-full bg-success/15 px-2 py-0.5 text-[11px] font-medium text-success">
                          {t.todo_kind === 'Récurrent' ? `Soldée le ${formatDateShort(t.last_done_occurrence)}` : 'Fait'}
                        </span>
                      ) : (
                        <span className="text-xs text-muted">{due.next ? `Prochaine : ${formatDateShort(due.next)}` : 'À faire'}</span>
                      )}
                    </td>
                    <td className="whitespace-nowrap px-3 text-right">
                      {due.due || (t.todo_kind === 'Ponctuel' && !t.done) ? (
                        <Button size="sm" variant="secondary" onClick={() => markDone(t)}>✓ Fait</Button>
                      ) : isDone ? (
                        <Button size="sm" variant="ghost" onClick={() => reopen(t)}>Rouvrir</Button>
                      ) : null}
                      <Button size="sm" variant="ghost" onClick={() => remove(t)} aria-label={`Supprimer ${t.text}`}>🗑</Button>
                    </td>
                  </tr>
                );
              })
            )}
          </tbody>
        </table>
      </div>
    </main>
  );
}

function sortKey(t, todayISO) {
  const due = todoDueState(t, todayISO);
  const date = t.todo_kind === 'Récurrent' ? due.occurrence || due.next || t.anchor_date : t.due_date;
  return `${due.due ? 0 : 1}-${date || '9999'}`;
}

function TodoForm({ initial, onSubmit, onCancel }) {
  const [values, setValues] = useState({ ...EMPTY, ...initial });
  const [error, setError] = useState(null);
  const set = (k) => (e) => setValues((v) => ({ ...v, [k]: e.target.value }));
  const input = 'h-10 w-full rounded-lg border border-border bg-background px-3 text-sm text-foreground';
  const label = 'mb-1 block text-xs font-semibold text-muted';

  function submit(e) {
    e.preventDefault();
    const err = validateTodo(values);
    setError(err);
    if (err) return;
    const clean = {
      text: values.text.trim(),
      details: values.details || '',
      link_url: values.link_url || '',
      todo_kind: values.todo_kind,
      due_date: values.todo_kind === 'Ponctuel' ? values.due_date : null,
      recurrence: values.todo_kind === 'Récurrent' ? values.recurrence : null,
      anchor_date: values.todo_kind === 'Récurrent' ? values.anchor_date : null,
    };
    onSubmit(clean);
  }

  return (
    <form onSubmit={submit} className="grid gap-3 rounded-xl border border-primary/30 bg-surface p-4 md:grid-cols-2">
      <div className="md:col-span-2">
        <label htmlFor="todo-text" className={label}>Tâche *</label>
        <input id="todo-text" value={values.text} onChange={set('text')} placeholder="Ex : Déclaration de TVA" className={input} autoFocus />
      </div>
      <div className="md:col-span-2">
        <label htmlFor="todo-details" className={label}>Détail / mode opératoire</label>
        <textarea id="todo-details" value={values.details} onChange={set('details')} rows={2} className="w-full rounded-lg border border-border bg-background p-3 text-sm text-foreground" />
      </div>
      <div>
        <label htmlFor="todo-kind" className={label}>Type</label>
        <select id="todo-kind" value={values.todo_kind} onChange={set('todo_kind')} className={input}>
          {TODO_KINDS.filter(Boolean).map((k) => <option key={k} value={k}>{k}</option>)}
        </select>
      </div>
      {values.todo_kind === 'Ponctuel' ? (
        <div>
          <label htmlFor="todo-due" className={label}>Échéance *</label>
          <input id="todo-due" type="date" value={values.due_date || ''} onChange={set('due_date')} className={input} />
        </div>
      ) : (
        <>
          <div>
            <label htmlFor="todo-rec" className={label}>Périodicité *</label>
            <select id="todo-rec" value={values.recurrence || ''} onChange={set('recurrence')} className={input}>
              {TODO_RECURRENCES.map((r) => <option key={r || 'none'} value={r}>{r || '— choisir —'}</option>)}
            </select>
          </div>
          <div>
            <label htmlFor="todo-anchor" className={label}>Première échéance *</label>
            <input id="todo-anchor" type="date" value={values.anchor_date || ''} onChange={set('anchor_date')} className={input} />
          </div>
        </>
      )}
      <div className="md:col-span-2">
        <label htmlFor="todo-link" className={label}>Lien utile</label>
        <input id="todo-link" type="url" value={values.link_url || ''} onChange={set('link_url')} placeholder="https://…" className={input} />
      </div>
      {error && <p role="alert" className="text-sm text-danger md:col-span-2">{error}</p>}
      <div className="flex gap-2 md:col-span-2">
        <Button type="submit">Enregistrer</Button>
        <Button variant="ghost" onClick={onCancel}>Annuler</Button>
      </div>
    </form>
  );
}
