/**
 * Helpers de formatage des dates — utilitaire partagé framework.
 *
 * Pourquoi ce module :
 *  Firestore stocke les dates sous forme de `Timestamp` (objet
 *  `{ seconds, nanoseconds }`). Si on essaie de rendre cet objet
 *  directement dans du JSX (`{item.due_date}`), React lève l'erreur #31
 *  ("Objects are not valid as a React child"). C'est ce qui a cassé la
 *  page /admin/opportunities en Sprint 18 (le seed Arnaud C a introduit
 *  les premiers docs avec dates en Timestamp).
 *
 *  Ces helpers absorbent les 4 formats que Trendl peut rencontrer en
 *  pratique sur le même champ "date" :
 *    1. Firestore Timestamp (objet avec `.toMillis()`)
 *    2. JS Date (objet avec `.getTime()`)
 *    3. number (millisecondes epoch)
 *    4. string ISO ou format libre ("2026-01-15", "15/01/2026"...)
 *
 *  Tous renvoient une **string** prête à être rendue, ou `null` si la
 *  valeur est absente / invalide.
 *
 * Convention d'usage :
 *  - `formatDateShort` (DD/MM/YYYY) → tableaux denses, cellules CRM
 *  - `formatDateLong` (15 janvier 2026) → fiches lisibles, communications
 *  - `formatDateRelative` (dans 3 jours, il y a 2 mois) → notifications, badges
 *  - `toMs` → comparaisons/tris (jamais à rendre dans le DOM)
 */

/**
 * Normalise une valeur "date" vers un timestamp en ms (epoch).
 * Retourne `null` si la valeur est falsy ou n'est pas parsable.
 */
export function toMs(value) {
  if (value === null || value === undefined || value === '') return null;
  if (typeof value === 'number') return Number.isFinite(value) ? value : null;
  if (value instanceof Date) {
    const t = value.getTime();
    return Number.isNaN(t) ? null : t;
  }
  // Firestore Timestamp (côté client SDK ou Admin SDK)
  if (typeof value === 'object' && typeof value.toMillis === 'function') {
    try { return value.toMillis(); } catch { return null; }
  }
  // Firestore Timestamp brut sérialisé en JSON ({seconds, nanoseconds})
  if (typeof value === 'object' && typeof value.seconds === 'number') {
    return value.seconds * 1000 + Math.floor((value.nanoseconds || 0) / 1e6);
  }
  // Sprint 81 — Timestamp Admin SDK sérialisé par res.json() côté CF
  // ({_seconds, _nanoseconds}) : rencontré via creatorPortalData pour les
  // champs posés en serverTimestamp() (ex: payment_paid_at).
  if (typeof value === 'object' && typeof value._seconds === 'number') {
    return value._seconds * 1000 + Math.floor((value._nanoseconds || 0) / 1e6);
  }
  // String ISO ou format libre — best effort
  if (typeof value === 'string') {
    const parsed = new Date(value);
    return Number.isNaN(parsed.getTime()) ? null : parsed.getTime();
  }
  return null;
}

/**
 * Format court (DD/MM/YYYY) — adapté aux tableaux denses CRM.
 * Retourne `null` si la valeur n'est pas parsable.
 */
export function formatDateShort(value) {
  const ms = toMs(value);
  if (ms === null) return null;
  return new Intl.DateTimeFormat('fr-FR', {
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
  }).format(new Date(ms));
}

/**
 * Format long lisible ("15 janvier 2026") — fiches et communications.
 * Retourne `null` si la valeur n'est pas parsable.
 */
export function formatDateLong(value) {
  const ms = toMs(value);
  if (ms === null) return null;
  return new Intl.DateTimeFormat('fr-FR', {
    day: 'numeric',
    month: 'long',
    year: 'numeric',
  }).format(new Date(ms));
}

/**
 * Format date + heure ("15/01/2026 à 14:30") — timeline d'activité, audit log.
 * Retourne `null` si la valeur n'est pas parsable.
 */
export function formatDateTime(value) {
  const ms = toMs(value);
  if (ms === null) return null;
  const d = new Date(ms);
  const date = new Intl.DateTimeFormat('fr-FR', {
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
  }).format(d);
  const time = new Intl.DateTimeFormat('fr-FR', {
    hour: '2-digit',
    minute: '2-digit',
  }).format(d);
  return `${date} à ${time}`;
}

/**
 * Format relatif humain ("dans 3 jours", "il y a 2 mois").
 * Retourne `null` si la valeur n'est pas parsable.
 */
export function formatDateRelative(value) {
  const ms = toMs(value);
  if (ms === null) return null;
  const now = Date.now();
  const diff = ms - now; // négatif = passé
  const absDays = Math.round(Math.abs(diff) / (24 * 60 * 60 * 1000));
  const sign = diff >= 0 ? 'dans' : 'il y a';
  if (absDays === 0) return "aujourd'hui";
  if (absDays === 1) return diff >= 0 ? 'demain' : 'hier';
  if (absDays < 30) return `${sign} ${absDays} jour${absDays > 1 ? 's' : ''}`;
  const absMonths = Math.round(absDays / 30);
  if (absMonths < 12) return `${sign} ${absMonths} mois`;
  const absYears = Math.round(absMonths / 12);
  return `${sign} ${absYears} an${absYears > 1 ? 's' : ''}`;
}
