'use client';

import { Icon } from '@/components/Icon';
import type { LiveStats } from '@/hooks/useWatchTracker';
import { formatDuration, formatPercentage, formatTimecode } from '@/lib/format';

/**
 * The information bar under the player: what is playing, and how much of it has
 * genuinely been watched.
 *
 * The numbers are computed in the browser from the same algorithm the server
 * uses, so they keep updating even when the analytics API is unreachable — and
 * nothing here is on the player's critical path.
 */
export function NowPlaying({
  title,
  channelName,
  stats,
  saving,
  onResume,
  resumePosition,
}: {
  title: string;
  channelName: string;
  stats: LiveStats;
  saving: 'idle' | 'ok' | 'offline';
  onResume: () => void;
  resumePosition: number | null;
}) {
  const { durationSeconds, watchedSeconds, skippedSeconds, reachedSeconds } = stats;
  const pct = (value: number) => (durationSeconds > 0 ? (value / durationSeconds) * 100 : 0);
  const progress = durationSeconds > 0 ? reachedSeconds / durationSeconds : 0;

  return (
    <section className="space-y-4">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0">
          <h1 className="truncate text-lg font-semibold tracking-tight sm:text-xl" title={title}>
            {title || 'Loading…'}
          </h1>
          <p className="mt-0.5 truncate text-sm text-muted">
            {channelName}
            {channelName && durationSeconds > 0 && ' · '}
            {durationSeconds > 0 && formatDuration(durationSeconds)}
          </p>
        </div>

        {resumePosition !== null && (
          <button type="button" onClick={onResume} className="btn btn-ghost shrink-0">
            <Icon name="play" size={12} />
            Continue from {formatTimecode(resumePosition)}
          </button>
        )}
      </div>

      <div className="card p-4">
        {/* Watched, then skipped, against the full duration. */}
        <div className="flex h-2 w-full overflow-hidden rounded-full bg-canvas">
          <div
            className="animate-grow h-full"
            style={{
              width: `${pct(watchedSeconds)}%`,
              backgroundImage:
                'linear-gradient(90deg, var(--color-brand), var(--color-accent))',
            }}
          />
          <div
            className="h-full"
            style={{ width: `${pct(skippedSeconds)}%`, background: 'var(--color-skip)' }}
          />
        </div>

        <dl className="mt-4 grid grid-cols-2 gap-4 sm:grid-cols-4">
          <Metric label="Actual watched" value={formatTimecode(watchedSeconds)} highlight />
          <Metric label="Skipped" value={formatTimecode(skippedSeconds)} muted />
          <Metric
            label="Progress"
            value={durationSeconds > 0 ? formatPercentage(progress) : '—'}
          />
          <Metric label="Length" value={formatTimecode(durationSeconds)} muted />
        </dl>

        <p className="mt-3 text-xs text-muted">
          {saving === 'offline'
            ? 'Not saving right now — playback and these numbers are unaffected.'
            : 'Fast-forwarding moves progress but never adds to actual watched time.'}
        </p>
      </div>
    </section>
  );
}

function Metric({
  label,
  value,
  highlight,
  muted,
}: {
  label: string;
  value: string;
  highlight?: boolean;
  muted?: boolean;
}) {
  return (
    <div>
      <dt className="text-xs text-muted">{label}</dt>
      <dd
        className={`stat mt-0.5 text-lg font-semibold ${
          highlight ? 'gradient-text' : muted ? 'text-muted' : ''
        }`}
      >
        {value}
      </dd>
    </div>
  );
}
