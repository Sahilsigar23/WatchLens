import type { Interval } from '@/lib/types';
import { formatDuration, formatTimecode } from '@/lib/format';

/**
 * The coverage ribbon — WatchLens's signature graphic.
 *
 * Every other tracker draws a progress bar: one number, one fill. This draws
 * the *timeline itself*, to scale, and shows which parts of it you genuinely
 * occupied. Solid sodium is time played. Hatched ghost is time you reached but
 * jumped over. Bare ground is the tail you never opened. A hairline marks the
 * furthest point reached.
 *
 * That is the product's entire thesis in one strip, and it is the same device
 * at three scales: one video (`Coverage`), one day, and one week (`HourStrip`).
 */

/** Percent of `total`, clamped, safe when `total` is 0 or unknown. */
function pct(value: number, total: number): number {
  if (!Number.isFinite(total) || total <= 0) return 0;
  return Math.max(0, Math.min(100, (value / total) * 100));
}

export function Coverage({
  intervals,
  durationSeconds,
  reachedSeconds,
  height = 'h-2.5',
  animate = true,
}: {
  intervals: Interval[];
  durationSeconds: number;
  reachedSeconds: number;
  /** Tailwind height class. Taller on the Watch page, thinner in lists. */
  height?: string;
  animate?: boolean;
}) {
  const known = durationSeconds > 0;

  /*
   * Skipped stretches are the gaps *between* watched runs, up to the furthest
   * point reached — never the unwatched tail, which was not skipped, just not
   * opened yet. Derived here rather than passed in so the ribbon can never
   * disagree with the runs drawn beside it.
   */
  const gaps: Interval[] = [];
  if (known) {
    let cursor = 0;
    for (const run of intervals) {
      if (run.start > cursor) gaps.push({ start: cursor, end: run.start });
      cursor = Math.max(cursor, run.end);
    }
  }

  const label = known
    ? `Coverage of ${formatTimecode(durationSeconds)}: ${intervals.length} watched ${
        intervals.length === 1 ? 'stretch' : 'stretches'
      }, ${gaps.length} skipped.`
    : 'Coverage unavailable until the video reports its length.';

  return (
    <div className={`track ${height}`} role="img" aria-label={label}>
      {gaps.map((gap) => (
        <span
          key={`gap-${gap.start}`}
          className="track-skip"
          style={{ left: `${pct(gap.start, durationSeconds)}%`, width: `${pct(gap.end - gap.start, durationSeconds)}%` }}
        />
      ))}

      {intervals.map((run) => (
        <span
          key={`run-${run.start}`}
          className={`track-run ${animate ? 'animate-wipe' : ''}`}
          style={{ left: `${pct(run.start, durationSeconds)}%`, width: `${pct(run.end - run.start, durationSeconds)}%` }}
        />
      ))}

      {known && reachedSeconds > 0 && reachedSeconds < durationSeconds && (
        <span className="track-head" style={{ left: `${pct(reachedSeconds, durationSeconds)}%` }} />
      )}
    </div>
  );
}

/**
 * A single-run fallback for rows that know a total and a watched amount but not
 * the intervals behind them — history rows, playlist items, channel totals.
 * Same vocabulary, less resolution: solid sodium for watched, hatched for
 * skipped, both to scale.
 */
export function Ratio({
  watchedSeconds,
  skippedSeconds,
  totalSeconds,
  height = 'h-1.5',
}: {
  watchedSeconds: number;
  skippedSeconds: number;
  totalSeconds: number;
  height?: string;
}) {
  const total = totalSeconds > 0 ? totalSeconds : watchedSeconds + skippedSeconds;

  return (
    <div
      className={`track ${height}`}
      role="img"
      aria-label={`${formatDuration(watchedSeconds)} watched, ${formatDuration(skippedSeconds)} skipped`}
    >
      <span
        className="track-run animate-wipe"
        style={{ left: 0, width: `${pct(watchedSeconds, total)}%` }}
      />
      <span
        className="track-skip"
        style={{ left: `${pct(watchedSeconds, total)}%`, width: `${pct(skippedSeconds, total)}%` }}
      />
    </div>
  );
}

/** Hours shown on a day axis. Every sixth keeps the row readable on a phone. */
export const HOUR_TICKS = [0, 6, 12, 18, 24];

/**
 * One day as a 24-hour raster: 24 cells, each lit in proportion to how much was
 * genuinely watched in that hour.
 *
 * Stacked seven-deep on the Weekly page this becomes a habit plot — vertical
 * bands are the hours you reliably study, and that is legible at a glance in a
 * way seven summed columns can never be.
 *
 * `peak` is passed in rather than derived so every row of a week shares one
 * scale. Deriving it per row would make a quiet day look identical to a heavy
 * one, which is exactly the comparison the plot exists to support.
 */
export function HourStrip({
  hourly,
  peak,
  height = 'h-9',
  label,
}: {
  hourly: number[];
  peak: number;
  height?: string;
  label: string;
}) {
  const ceiling = Math.max(1, peak);

  return (
    <div
      className={`track track-quiet ${height} flex gap-px`}
      role="img"
      aria-label={`${label}: ${formatDuration(hourly.reduce((sum, s) => sum + s, 0))} watched`}
    >
      {hourly.map((seconds, hour) => {
        // Any watched time at all gets a visible floor, so a ten-minute hour is
        // never rounded into looking like an empty one.
        const intensity = seconds > 0 ? Math.max(0.22, seconds / ceiling) : 0;

        return (
          <span
            key={hour}
            className="relative flex-1"
            title={`${String(hour).padStart(2, '0')}:00 — ${formatDuration(seconds)}`}
          >
            {seconds > 0 && (
              <span
                className="animate-wipe-y absolute inset-x-0 bottom-0"
                style={{
                  height: `${Math.round(intensity * 100)}%`,
                  backgroundColor: 'var(--color-signal)',
                }}
              />
            )}
          </span>
        );
      })}
    </div>
  );
}

/** The mono tick row that sits under a day raster. */
export function HourAxis() {
  return (
    <div className="data mt-1.5 flex justify-between text-[0.625rem] text-dim">
      {HOUR_TICKS.map((hour) => (
        <span key={hour}>{String(hour % 24).padStart(2, '0')}</span>
      ))}
    </div>
  );
}
