'use client';

import type { LiveStats } from '@/hooks/useWatchTracker';
import { formatPercentage, formatTimecode } from '@/lib/format';

/**
 * Live readout for the video on screen.
 *
 * Computed entirely in the browser from the same algorithm the server uses, so
 * the numbers keep updating even when the analytics API is unreachable.
 */
export function LiveSession({
  stats,
  saving,
}: {
  stats: LiveStats;
  saving: 'idle' | 'ok' | 'offline';
}) {
  const { durationSeconds, watchedSeconds, skippedSeconds, reachedSeconds } = stats;
  const pct = (value: number) => (durationSeconds > 0 ? (value / durationSeconds) * 100 : 0);

  return (
    <div className="card p-4">
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <h2 className="text-sm font-semibold">This video</h2>
        {saving === 'offline' && (
          <span className="text-xs text-muted">
            Not saving right now — playback and these numbers are unaffected.
          </span>
        )}
      </div>

      {/* Coverage bar: watched, skipped, and the part never reached. */}
      <div className="mt-3 flex h-2.5 w-full overflow-hidden rounded-full bg-canvas">
        <div
          className="h-full"
          style={{ width: `${pct(watchedSeconds)}%`, background: 'var(--color-brand)' }}
        />
        <div
          className="h-full"
          style={{ width: `${pct(skippedSeconds)}%`, background: 'var(--color-skip)' }}
        />
      </div>

      <dl className="mt-3 grid grid-cols-2 gap-x-6 gap-y-2 text-sm sm:grid-cols-4">
        <Item label="Duration" value={formatTimecode(durationSeconds)} />
        <Item label="Actual watched" value={formatTimecode(watchedSeconds)} accent="var(--color-brand)" />
        <Item label="Skipped" value={formatTimecode(skippedSeconds)} accent="var(--color-skip)" />
        <Item
          label="Completion"
          value={durationSeconds > 0 ? formatPercentage(reachedSeconds / durationSeconds) : '—'}
        />
      </dl>

      <p className="mt-3 text-xs text-muted">
        Fast-forwarding moves the completion marker but never adds to actual watched time.
      </p>
    </div>
  );
}

function Item({ label, value, accent }: { label: string; value: string; accent?: string }) {
  return (
    <div>
      <dt className="text-xs text-muted">{label}</dt>
      <dd className="mt-0.5 font-medium tabular-nums" style={accent ? { color: accent } : undefined}>
        {value}
      </dd>
    </div>
  );
}
