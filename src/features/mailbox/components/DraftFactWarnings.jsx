'use client';

/**
 * DraftFactWarnings — repris de Trendl (Sprint 103).
 *
 * Liens, téléphones ou adresses écrits par l'IA qui ne figurent pas dans le
 * fil d'e-mails (Trendl : ni dans le fil ni dans le CRM) : affichés en rouge sous le
 * brouillon, à vérifier avant l'envoi. Un élément corrigé ou supprimé du
 * texte disparaît de la liste. Simple avertissement : un lien collé à la
 * main peut partir.
 */

export function visibleWarnings(warnings, text) {
  const body = String(text || '');
  return (Array.isArray(warnings) ? warnings : []).filter(
    (w) => w && w.value && body.includes(w.value)
  );
}

export function DraftFactWarnings({ warnings, text }) {
  const list = visibleWarnings(warnings, text);
  if (list.length === 0) return null;
  return (
    <div
      role="alert"
      className="mt-2 rounded-lg border border-danger/40 bg-danger/10 p-2 text-xs text-danger"
    >
      <p className="font-semibold">
        À vérifier avant l&apos;envoi : non trouvé dans le CRM ni dans le fil
      </p>
      <ul className="mt-1 list-disc space-y-0.5 pl-4">
        {list.map((w) => (
          <li key={`${w.kind}-${w.value}`} className="break-all">
            {w.kind} non vérifié : <span className="font-mono">{w.value}</span>
          </li>
        ))}
      </ul>
    </div>
  );
}
