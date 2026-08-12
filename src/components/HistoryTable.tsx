'use client';

import { useEffect, useState } from 'react';

import { CategoryBadge } from '@/components/CategoryBadge';
import { formatDuration, formatPercentage } from '@/lib/format';
import type { HistoryRow } from '@/lib/types';

/**
 * Every video ever watched here, newest first.
 *
 * Figures are all-time per video: sessions are merged before counting, so a
 * lecture watched over three evenings shows unique coverage rather than the sum
 * of three overlapping attempts.
 */
export function HistoryTable() {
  const [rows, setRows] = useState<HistoryRow[] | null>(null);
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    let cancelled = false;

    fetch('/api/history')
      .then((response) => {
        if (!response.ok) throw new Error(`HTTP ${response.status}`);
        return response.json() as Promise<{ videos: HistoryRow[] }>;
      })
      .then((data) => {
        if (!cancelled) setRows(data.videos);
      })
      .catch(() => {
        if (!cancelled) setFailed(true);
      });

    return () => {
      cancelled = true;
    };
  }, []);

  if (failed) {
    return <p className="card p-6 text-sm text-muted">Could not load history. Try reloading.</p>;
  }

  if (rows === null) {
    return <p className="card p-6 text-sm text-muted">Loading history…</p>;
  }

  if (rows.length === 0) {
    return (
      <p className="card p-6 text-sm text-muted">
        Nothing here yet. Watch a video on the Watch page and it will appear.
      </p>
    );
  }

  return (
    <div className="space-y-3">
      {/* Cards on small screens, a table from `sm` up — the same data either way. */}
      <div className="space-y-3 sm:hidden">
        {rows.map((row) => (
          <article key={row.youtubeVideoId} className="card space-y-2 p-4">
            <div className="flex items-start justify-between gap-3">
              <div className="min-w-0">
                <h3 className="truncate text-sm font-medium">{row.title || row.youtubeVideoId}</h3>
                <p className="truncate text-xs text-muted">{row.channelName}</p>
              </div>
              <CategoryBadge category={row.category} />
            </div>
            <CoverageBar row={row} />
            <dl className="grid grid-cols-2 gap-x-4 gap-y-1 text-xs">
              <Pair label="Duration" value={formatDuration(row.durationSeconds)} />
              <Pair label="Actual watched" value={formatDuration(row.watchedSeconds)} />
              <Pair label="Skipped" value={formatDuration(row.skippedSeconds)} />
              <Pair label="Completion" value={formatPercentage(row.watchedPercentage)} />
            </dl>
            <p className="text-xs text-muted">{formatDate(row.lastWatchedAt)}</p>
          </article>
        ))}
      </div>

      <div className="card hidden overflow-x-auto sm:block">
        <table className="w-full min-w-[46rem] text-sm">
          <thead>
            <tr className="border-b border-line text-left text-xs uppercase tracking-wide text-muted">
              <th className="px-4 py-3 font-medium">Video</th>
              <th className="px-4 py-3 font-medium">Category</th>
              <th className="px-4 py-3 text-right font-medium">Duration</th>
              <th className="px-4 py-3 text-right font-medium">Watched</th>
              <th className="px-4 py-3 text-right font-medium">Skipped</th>
              <th className="px-4 py-3 text-right font-medium">%</th>
              <th className="px-4 py-3 text-right font-medium">Date</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((row) => (
              <tr key={row.youtubeVideoId} className="border-b border-line last:border-0">
                <td className="max-w-[22rem] px-4 py-3">
                  <p className="truncate font-medium">{row.title || row.youtubeVideoId}</p>
                  <p className="truncate text-xs text-muted">{row.channelName}</p>
                  <div className="mt-1.5 max-w-[16rem]">
                    <CoverageBar row={row} />
                  </div>
                </td>
                <td className="px-4 py-3">
                  <CategoryBadge category={row.category} />
                </td>
                <td className="px-4 py-3 text-right tabular-nums">
                  {formatDuration(row.durationSeconds)}
                </td>
                <td className="px-4 py-3 text-right tabular-nums">
                  {formatDuration(row.watchedSeconds)}
                </td>
                <td className="px-4 py-3 text-right tabular-nums text-muted">
                  {formatDuration(row.skippedSeconds)}
                </td>
                <td className="px-4 py-3 text-right tabular-nums">
                  {formatPercentage(row.watchedPercentage)}
                </td>
                <td className="whitespace-nowrap px-4 py-3 text-right text-xs text-muted">
                  {formatDate(row.lastWatchedAt)}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

function CoverageBar({ row }: { row: HistoryRow }) {
  const pct = (value: number) =>
    row.durationSeconds > 0 ? (value / row.durationSeconds) * 100 : 0;

  return (
    <div
      className="flex h-1.5 w-full overflow-hidden rounded-full bg-canvas"
      title={`${formatDuration(row.watchedSeconds)} watched, ${formatDuration(row.skippedSeconds)} skipped`}
    >
      <div style={{ width: `${pct(row.watchedSeconds)}%`, background: 'var(--color-brand)' }} />
      <div style={{ width: `${pct(row.skippedSeconds)}%`, background: 'var(--color-skip)' }} />
    </div>
  );
}

function Pair({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex justify-between gap-2">
      <dt className="text-muted">{label}</dt>
      <dd className="tabular-nums">{value}</dd>
    </div>
  );
}

function formatDate(iso: string): string {
  return new Date(iso).toLocaleDateString(undefined, {
    day: 'numeric',
    month: 'short',
    year: 'numeric',
  });
}
