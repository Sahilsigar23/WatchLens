'use client';

import { memo } from 'react';

import { formatDuration, formatPercentage } from '@/lib/format';
import type { PlaylistAnalytics as Analytics } from '@/lib/types';

/**
 * Aggregate figures for the open playlist.
 *
 * Every number is derived from the same watch_events log as the rest of the
 * app, so playlist progress can never disagree with the history page.
 */
export const PlaylistAnalytics = memo(function PlaylistAnalytics({
  analytics,
}: {
  analytics: Analytics;
}) {
  const {
    videoCount,
    completed,
    inProgress,
    notStarted,
    watchedSeconds,
    totalDurationSeconds,
    skippedSeconds,
    progress,
    durationsIncomplete,
  } = analytics;

  return (
    <div className="card p-4">
      <h2 className="text-sm font-semibold">Playlist progress</h2>

      <div className="mt-3 flex h-2.5 w-full overflow-hidden rounded-full bg-canvas">
        <div
          className="h-full"
          style={{ width: `${Math.min(100, progress * 100)}%`, background: 'var(--color-brand)' }}
        />
        <div
          className="h-full"
          style={{
            width: `${
              totalDurationSeconds > 0
                ? Math.min(100 - progress * 100, (skippedSeconds / totalDurationSeconds) * 100)
                : 0
            }%`,
            background: 'var(--color-skip)',
          }}
        />
      </div>

      <dl className="mt-3 grid grid-cols-2 gap-x-6 gap-y-2 text-sm sm:grid-cols-4">
        <Item label="Videos" value={String(videoCount)} />
        <Item label="Completed" value={String(completed)} accent="var(--color-study)" />
        <Item label="In progress" value={String(inProgress)} accent="var(--color-fun)" />
        <Item label="Not started" value={String(notStarted)} />

        <Item label="Actual study time" value={formatDuration(watchedSeconds)} accent="var(--color-brand)" />
        <Item
          label="Total duration"
          value={totalDurationSeconds > 0 ? formatDuration(totalDurationSeconds) : '—'}
        />
        <Item label="Skipped" value={formatDuration(skippedSeconds)} accent="var(--color-skip)" />
        <Item
          label="Actual progress"
          value={totalDurationSeconds > 0 ? formatPercentage(progress) : '—'}
        />
      </dl>

      {durationsIncomplete && (
        <p className="mt-3 text-xs text-muted">
          Some durations are not known yet — they fill in as you open each video. Set
          <code className="mx-1">YOUTUBE_API_KEY</code>
          to have them all up front.
        </p>
      )}
    </div>
  );
});

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
