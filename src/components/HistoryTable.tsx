'use client';

import { useRouter } from 'next/navigation';
import { useEffect, useMemo, useState } from 'react';

import { CategoryBadge } from '@/components/CategoryBadge';
import { usePlayerCommands } from '@/components/AppShell';
import { Icon } from '@/components/Icon';
import { formatDuration, formatPercentage } from '@/lib/format';
import type { Category, HistoryRow } from '@/lib/types';

type Filter = 'ALL' | Category;

const FILTERS: { key: Filter; label: string }[] = [
  { key: 'ALL', label: 'All' },
  { key: 'STUDY', label: 'Study' },
  { key: 'ENTERTAINMENT', label: 'Entertainment' },
  { key: 'OTHER', label: 'Other' },
];

/**
 * Watch history as a media library rather than a table.
 *
 * Figures are all-time per video: sessions are merged before counting, so a
 * lecture watched over three evenings shows unique coverage rather than the sum
 * of three overlapping attempts.
 */
export function HistoryTable() {
  const router = useRouter();
  const { openVideo } = usePlayerCommands();

  /** Loads the video into the persistent player, then shows the Watch page. */
  const watchAgain = (videoId: string) => {
    openVideo(videoId);
    router.push('/');
  };

  const [rows, setRows] = useState<HistoryRow[] | null>(null);
  const [failed, setFailed] = useState(false);
  const [filter, setFilter] = useState<Filter>('ALL');

  useEffect(() => {
    let cancelled = false;

    fetch('/api/user/history')
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

  const counts = useMemo(() => {
    const base: Record<Filter, number> = { ALL: 0, STUDY: 0, ENTERTAINMENT: 0, OTHER: 0 };
    for (const row of rows ?? []) {
      base.ALL += 1;
      base[row.category] += 1;
    }
    return base;
  }, [rows]);

  const visible = (rows ?? []).filter((row) => filter === 'ALL' || row.category === filter);

  if (failed) {
    return <p className="card p-6 text-sm text-muted">Could not load history. Try reloading.</p>;
  }

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap gap-2">
        {FILTERS.map((option) => (
          <button
            key={option.key}
            type="button"
            aria-pressed={filter === option.key}
            onClick={() => setFilter(option.key)}
            className="chip"
          >
            {option.label}
            {rows && <span className="text-muted">{counts[option.key]}</span>}
          </button>
        ))}
      </div>

      {rows === null ? (
        <ul className="space-y-3">
          {[0, 1, 2, 3].map((i) => (
            <li key={i} className="skeleton h-[5.5rem] w-full" />
          ))}
        </ul>
      ) : visible.length === 0 ? (
        <p className="card p-8 text-center text-sm text-muted">
          {rows.length === 0
            ? 'Nothing here yet. Watch something and it will appear.'
            : 'No videos in this category.'}
        </p>
      ) : (
        <ul className="space-y-3">
          {visible.map((row) => (
            <li key={row.youtubeVideoId}>
              <article className="card card-hover overflow-hidden">
                <div className="flex gap-3 p-3 sm:gap-4 sm:p-4">
                  <button
                    type="button"
                    onClick={() => watchAgain(row.youtubeVideoId)}
                    className="group relative h-[3.9rem] w-[6.9rem] shrink-0 overflow-hidden rounded-xl sm:h-20 sm:w-36"
                    aria-label={`Watch ${row.title || row.youtubeVideoId} again`}
                  >
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img
                      src={`https://i.ytimg.com/vi/${row.youtubeVideoId}/mqdefault.jpg`}
                      alt=""
                      className="h-full w-full object-cover"
                      loading="lazy"
                    />
                    <span className="absolute inset-0 grid place-items-center bg-black/45 text-white opacity-0 transition-opacity group-hover:opacity-100">
                      <Icon name="play" size={18} />
                    </span>
                  </button>

                  <div className="min-w-0 flex-1">
                    <div className="flex items-start justify-between gap-3">
                      <div className="min-w-0">
                        <h3 className="truncate text-sm font-medium sm:text-base">
                          {row.title || row.youtubeVideoId}
                        </h3>
                        <p className="truncate text-xs text-muted">{row.channelName}</p>
                      </div>
                      <CategoryBadge category={row.category} />
                    </div>

                    <div className="mt-2.5 flex h-1.5 w-full overflow-hidden rounded-full bg-canvas">
                      <div
                        className="animate-grow h-full"
                        style={{
                          width: `${pct(row.watchedSeconds, row.durationSeconds)}%`,
                          backgroundImage:
                            'linear-gradient(90deg, var(--color-brand), var(--color-accent))',
                        }}
                      />
                      <div
                        className="h-full"
                        style={{
                          width: `${pct(row.skippedSeconds, row.durationSeconds)}%`,
                          background: 'var(--color-skip)',
                        }}
                      />
                    </div>

                    <p className="mt-2 flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-muted">
                      <span className="text-ink">
                        <span className="stat font-semibold">
                          {formatDuration(row.watchedSeconds)}
                        </span>
                        {row.durationSeconds > 0 && ` / ${formatDuration(row.durationSeconds)}`}
                      </span>
                      <span>·</span>
                      <span>{formatPercentage(row.watchedPercentage)} actual</span>
                      {row.skippedSeconds > 0 && (
                        <>
                          <span>·</span>
                          <span>{formatDuration(row.skippedSeconds)} skipped</span>
                        </>
                      )}
                      <span>·</span>
                      <span>{relativeDate(row.lastWatchedAt)}</span>
                    </p>
                  </div>
                </div>
              </article>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

function pct(value: number, duration: number): number {
  return duration > 0 ? Math.min(100, (value / duration) * 100) : 0;
}

/** "Today" / "Yesterday" read better than a date for anything recent. */
function relativeDate(iso: string): string {
  const then = new Date(iso);
  const startOfDay = (d: Date) => new Date(d.getFullYear(), d.getMonth(), d.getDate()).getTime();
  const days = Math.round((startOfDay(new Date()) - startOfDay(then)) / 86_400_000);

  if (days <= 0) return 'Today';
  if (days === 1) return 'Yesterday';
  if (days < 7) return `${days} days ago`;
  return then.toLocaleDateString(undefined, { day: 'numeric', month: 'short', year: 'numeric' });
}
