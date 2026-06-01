/**
 * Memory freshness: mechanical age stamping for memory notes.
 *
 * A memory note is a point-in-time observation, not live state. The older a note is,
 * the more likely its file:line citations or claims about code have drifted since it
 * was written. We stamp a compact age on the always-loaded corpus index so the agent
 * can weight notes at selection time, and we attach an explicit "verify before
 * asserting" caveat when a stale note is surfaced in full (file notes on read/edit).
 *
 * No model calls and no extra state — this is pure arithmetic over file mtimes.
 */

const MS_PER_DAY = 86_400_000;

/** Notes at or beyond this age get a staleness caveat when surfaced in full. */
export const STALE_THRESHOLD_DAYS = 14;

/** Whole days between a file's last-modified time and now (never negative). */
export function ageInDays(mtimeMs: number, now = Date.now()): number {
	return Math.max(0, Math.floor((now - mtimeMs) / MS_PER_DAY));
}

/** Compact age tag for the always-loaded corpus index, e.g. "today", "5d", "3w", "8mo", "2y". */
export function formatAgeShort(days: number): string {
	if (days <= 0) return "today";
	if (days < 14) return `${days}d`;
	if (days < 60) return `${Math.round(days / 7)}w`;
	if (days < 365) return `${Math.round(days / 30)}mo`;
	return `${Math.round(days / 365)}y`;
}

/**
 * Staleness caveat for a note of the given age, or null if it's still fresh.
 * Surfaced alongside the note's content so the agent treats old claims with suspicion
 * instead of asserting them as current fact.
 */
export function freshnessCaveat(days: number): string | null {
	if (days < STALE_THRESHOLD_DAYS) return null;
	return `This note is ${formatAgeShort(days)} old — a point-in-time observation, not live state. Any file:line references or claims about code may have drifted; verify against the current code before relying on them.`;
}
