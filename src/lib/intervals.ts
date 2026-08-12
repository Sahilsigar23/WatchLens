import type { Interval } from './types';

/**
 * Interval-set helpers. Deliberately dependency-free and pure so the watch-time
 * algorithm can be unit-tested without a database or a browser.
 */

/**
 * Merges overlapping and touching intervals into a minimal sorted set.
 *
 * This is what stops a rewatched section from being counted twice: watching
 * 0-60 and then 30-90 is 90 seconds of unique video, not 120.
 */
export function mergeIntervals(intervals: Interval[]): Interval[] {
  const clean = intervals
    .filter((i) => Number.isFinite(i.start) && Number.isFinite(i.end) && i.end > i.start)
    .sort((a, b) => a.start - b.start);

  const merged: Interval[] = [];
  for (const current of clean) {
    const last = merged[merged.length - 1];
    if (last && current.start <= last.end) {
      // Overlapping or adjacent — widen the existing span instead of adding one.
      if (current.end > last.end) last.end = current.end;
    } else {
      merged.push({ start: current.start, end: current.end });
    }
  }
  return merged;
}

/** Total length of a set of intervals, counting overlaps once. */
export function unionLength(intervals: Interval[]): number {
  return mergeIntervals(intervals).reduce((sum, i) => sum + (i.end - i.start), 0);
}

/** Total length counting every interval separately (so rewatches add up). */
export function rawLength(intervals: Interval[]): number {
  return intervals.reduce((sum, i) => sum + Math.max(0, i.end - i.start), 0);
}

/**
 * Clamps an interval to `[0, max]`, returning null if nothing is left.
 * Player positions occasionally come back slightly negative or past the
 * reported duration; clamping keeps those out of the totals.
 */
export function clampInterval(interval: Interval, max: number): Interval | null {
  const start = Math.max(0, interval.start);
  const end = max > 0 ? Math.min(max, interval.end) : interval.end;
  return end > start ? { start, end } : null;
}
