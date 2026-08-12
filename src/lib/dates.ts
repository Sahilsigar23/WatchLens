import { dateKeyInZone } from './analytics';

/**
 * Date-window helpers for the analytics routes.
 *
 * Arithmetic runs on a UTC-anchored `Date` built from the already-formatted
 * local date key, so adding days can never be knocked sideways by a daylight
 * saving transition.
 */

export const DEFAULT_TIME_ZONE = 'UTC';

/** `YYYY-MM-DD` for right now in `timeZone`. */
export function todayInZone(timeZone: string): string {
  return dateKeyInZone(new Date(), timeZone);
}

/** The seven `YYYY-MM-DD` keys of the current week in `timeZone`, Monday first. */
export function weekDatesInZone(timeZone: string): string[] {
  const [year, month, day] = todayInZone(timeZone).split('-').map(Number);
  const anchor = new Date(Date.UTC(year, month - 1, day));

  // getUTCDay(): 0 = Sunday. Shift so Monday starts the week.
  anchor.setUTCDate(anchor.getUTCDate() - ((anchor.getUTCDay() + 6) % 7));

  return Array.from({ length: 7 }, (_, i) => {
    const date = new Date(anchor);
    date.setUTCDate(anchor.getUTCDate() + i);
    return date.toISOString().slice(0, 10);
  });
}

/**
 * A UTC range guaranteed to contain every session belonging to `dates` in any
 * timezone. Deliberately one day wider on each side — over-fetching a few rows
 * is far cheaper than dropping a session because the user is at UTC+14.
 */
export function utcRangeFor(dates: string[]): { since: Date; until: Date } {
  const first = new Date(`${dates[0]}T00:00:00Z`);
  const last = new Date(`${dates[dates.length - 1]}T00:00:00Z`);

  first.setUTCDate(first.getUTCDate() - 1);
  last.setUTCDate(last.getUTCDate() + 2);

  return { since: first, until: last };
}

/**
 * Reads a positive integer query parameter, falling back when it is absent or
 * unusable.
 *
 * The subtlety this exists for: `searchParams.get()` returns `null` when a
 * parameter is missing, and `Number(null)` is `0` — which is finite, so a naive
 * `Number.isFinite` check accepts it and a `Math.max(1, …)` clamp silently turns
 * "no limit given" into "limit 1".
 */
export function parsePositiveInt(
  raw: string | null,
  fallback: number,
  max: number,
): number {
  if (raw === null || raw.trim() === '') return fallback;
  const value = Number(raw);
  if (!Number.isFinite(value) || value < 1) return fallback;
  return Math.min(max, Math.floor(value));
}

/** Reads `?tz=` and falls back rather than trusting arbitrary input. */
export function timeZoneFromRequest(request: Request): string {
  const value = new URL(request.url).searchParams.get('tz');
  if (!value) return DEFAULT_TIME_ZONE;

  try {
    new Intl.DateTimeFormat('en-CA', { timeZone: value });
    return value;
  } catch {
    return DEFAULT_TIME_ZONE;
  }
}
