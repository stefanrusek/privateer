/**
 * Age formatting for Kubernetes resource creation timestamps (Spec 03 §6).
 * Pure function — takes nowMs as a parameter, never calls Date.now().
 */

const SECOND_MS = 1000;
const MINUTE_MS = 60 * SECOND_MS;
const HOUR_MS = 60 * MINUTE_MS;
const DAY_MS = 24 * HOUR_MS;
const MONTH_MS = 30 * DAY_MS;
const YEAR_MS = 365 * DAY_MS;

/**
 * Format the age of a resource given its creation timestamp and the current
 * time in epoch milliseconds.
 *
 * Thresholds (Spec 03 §6):
 *   < 60s   → "42s"
 *   < 60m   → "14m"
 *   < 24h   → "6h"
 *   < 30d   → "12d"
 *   >= 30d  → "3mo"
 *   >= 365d → "2y"
 */
export function formatAge(creationTimestampIso: string, nowMs: number): string {
  const createdMs = new Date(creationTimestampIso).getTime();
  if (Number.isNaN(createdMs)) {
    return '';
  }
  const diffMs = Math.max(0, nowMs - createdMs);

  if (diffMs < MINUTE_MS) {
    return `${String(Math.floor(diffMs / SECOND_MS))}s`;
  }

  if (diffMs < HOUR_MS) {
    return `${String(Math.floor(diffMs / MINUTE_MS))}m`;
  }

  if (diffMs < DAY_MS) {
    return `${String(Math.floor(diffMs / HOUR_MS))}h`;
  }

  if (diffMs < MONTH_MS) {
    return `${String(Math.floor(diffMs / DAY_MS))}d`;
  }

  if (diffMs < YEAR_MS) {
    return `${String(Math.floor(diffMs / MONTH_MS))}mo`;
  }

  return `${String(Math.floor(diffMs / YEAR_MS))}y`;
}
