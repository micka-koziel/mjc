/**
 * ingestion-health.js — logique PURE de décision pour le healthcheck
 * d'ingestion Gmail (Sprint 57, Action 1 d'Alex, constat M07-R7).
 *
 * Pourquoi un module séparé : la Cloud Function `checkIngestionHealth` charge
 * Firebase Admin au require, donc elle n'est pas testable « à froid ». On isole
 * ici la décision pure (sans I/O) pour pouvoir la tester unitairement, comme
 * le reste des helpers du repo (cf. backup-status.js / decideBackupHealth).
 *
 * Angle framework : le pattern « compteur d'échecs consécutifs + seuil
 * d'alerte » est réutilisable pour n'importe quel mécanisme de reprise
 * automatique (watch, webhook, subscription externe).
 */

// Seuil d'échecs de reprise consécutifs au-delà duquel on émet une ALERTE.
// 3 échecs ≈ 1h30 d'ingestion morte malgré les tentatives de reprise (cron
// toutes les 30 min) : le bon moment pour déranger un humain. En-dessous, on
// reste en warning (un échec ponctuel n'est pas une panne durable).
const RECOVERY_ALERT_THRESHOLD = 3;

/**
 * Faut-il déclencher une alerte « ingestion en panne durable » ?
 *
 * @param {number} consecutiveFailures Nombre d'échecs de reprise consécutifs
 * @param {number} [threshold=RECOVERY_ALERT_THRESHOLD] Seuil d'alerte
 * @return {boolean} true si on doit alerter (≥ seuil)
 */
function shouldAlertRecovery(
  consecutiveFailures,
  threshold = RECOVERY_ALERT_THRESHOLD,
) {
  return (consecutiveFailures || 0) >= threshold;
}

module.exports = {
  RECOVERY_ALERT_THRESHOLD,
  shouldAlertRecovery,
};
