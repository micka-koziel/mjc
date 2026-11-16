/**
 * Âge en JOURS DU CALENDRIER, heure de Paris (Sprint 101.10).
 *
 * Mickaël, 20/10 : un mail du 19 à 10 h 17 lu le 20 à 8 h 03 doit être
 * « reçu hier », pas « aujourd'hui ». L'ancien calcul comptait des tranches
 * de 24 h. Utilisé par l'accueil (Aujourd'hui) et par « À traiter ».
 */
const DAY_MS = 24 * 60 * 60 * 1000;
const PARIS_DAY = new Intl.DateTimeFormat('en-CA', {
  timeZone: 'Europe/Paris',
  year: 'numeric',
  month: '2-digit',
  day: '2-digit',
});

function parisDayIndex(ms) {
  const [y, m, d] = PARIS_DAY.format(new Date(ms)).split('-').map(Number);
  return Math.round(Date.UTC(y, m - 1, d) / DAY_MS);
}

/** Nombre de jours du calendrier entre `ms` et `now` (0 = aujourd'hui). */
export function calendarDaysSince(ms, now = Date.now()) {
  if (ms === null || ms === undefined || !Number.isFinite(Number(ms))) return null;
  return Math.max(0, parisDayIndex(now) - parisDayIndex(Number(ms)));
}
