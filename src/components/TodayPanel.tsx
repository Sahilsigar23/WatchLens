'use client';

import { useCallback, useEffect, useState } from 'react';

import { useStatsRefresh } from '@/components/AppShell';
import { StatTile } from '@/components/StatTile';
import { formatDuration, formatPercentage } from '@/lib/format';
import type { DayStats, HistoryRow } from '@/lib/types';

/** Background refresh cadence while the section is open. */
const REFRESH_MS = 60_000;

/** Hour labels under the activity strip — every sixth hour keeps it readable. */
const HOUR_TICKS = [0, 6, 12, 18];

export function TodayPanel({ name }: { name: string }) {
  const refreshSignal = useStatsRefresh();
  const [stats, setStats] = useState<DayStats | null>(null);
  const [hourly, setHourly] = useState<number[] | null>(null);
  const [recent, setRecent] = useState<HistoryRow[] | null>(null);

  const refresh = useCallback(async () => {
    const tz = Intl.DateTimeFormat().resolvedOptions().timeZone;
    try {
      const response = await fetch(`/api/stats/today?tz=${encodeURIComponent(tz)}`);
      if (response.ok) {
        const data = (await response.json()) as { stats: DayStats; hourly: number[] };
        setStats(data.stats);
        setHourly(data.hourly ?? []);
      }

      const history = await fetch('/api/user/history?limit=5');
      if (history.ok) setRecent(((await history.json()) as { videos: HistoryRow[] }).videos);
    } catch {
      // Keep whatever we last had. Stale numbers beat an error banner.
    }
  }, []);

  useEffect(() => {
    void refresh();
    const interval = setInterval(() => void refresh(), REFRESH_MS);
    return () => clearInterval(interval);
  }, [refresh, refreshSignal]);

  const loading = stats === null;
  const peak = Math.max(1, ...(hourly ?? [1]));

  return (
    <div className="space-y-8">
      <header>
        <h1 className="text-2xl font-semibold tracking-tight sm:text-3xl">
          {greeting()}
          {name ? <span className="gradient-text">, {name}</span> : null}
        </h1>
        <p className="mt-1 text-sm text-muted">Here&rsquo;s your learning activity today.</p>
      </header>

      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <StatTile
          label="Actually watched"
          value={loading ? null : formatDuration(stats.watchedSeconds)}
          hint="Video you really played"
          icon="play"
          accent="brand"
        />
        <StatTile
          label="Learning"
          value={loading ? null : formatDuration(stats.studySeconds)}
          hint={loading ? undefined : `${stats.studyVideoCount} study video(s)`}
          icon="sparkle"
          accent="study"
        />
        <StatTile
          label="Skipped"
          value={loading ? null : formatDuration(stats.skippedSeconds)}
          hint="Fast-forwarded past"
          icon="chevronRight"
          accent="skip"
        />
        <StatTile
          label="Videos"
          value={loading ? null : String(stats.videoCount)}
          hint={loading ? undefined : `${formatDuration(stats.totalYoutubeSeconds)} on site`}
          icon="list"
        />
      </div>

      <section className="space-y-3">
        <div className="flex items-baseline justify-between">
          <h2 className="text-sm font-semibold">Today&rsquo;s activity</h2>
          <span className="text-xs text-muted">by hour</span>
        </div>

        <div className="card p-4">
          {hourly === null ? (
            <div className="skeleton h-24 w-full" />
          ) : hourly.every((value) => value === 0) ? (
            <p className="py-8 text-center text-sm text-muted">
              Nothing watched yet today. Open something on the Watch page.
            </p>
          ) : (
            <>
              <div className="flex h-24 items-end gap-[2px]">
                {hourly.map((seconds, hour) => (
                  <div
                    key={hour}
                    className="animate-grow-y group relative flex-1 rounded-t-sm"
                    style={{
                      height: `${Math.max(seconds > 0 ? 6 : 2, (seconds / peak) * 100)}%`,
                      backgroundImage:
                        seconds > 0
                          ? 'linear-gradient(180deg, var(--color-accent), var(--color-brand))'
                          : undefined,
                      backgroundColor: seconds > 0 ? undefined : 'var(--color-line)',
                    }}
                    title={`${String(hour).padStart(2, '0')}:00 — ${formatDuration(seconds)}`}
                  />
                ))}
              </div>
              <div className="mt-2 flex justify-between text-[0.65rem] text-muted">
                {HOUR_TICKS.map((hour) => (
                  <span key={hour}>{String(hour).padStart(2, '0')}:00</span>
                ))}
                <span>23:00</span>
              </div>
            </>
          )}
        </div>
      </section>

      <section className="space-y-3">
        <h2 className="text-sm font-semibold">Recently watched</h2>
        {recent === null ? (
          <div className="space-y-2">
            {[0, 1, 2].map((i) => (
              <div key={i} className="skeleton h-16 w-full" />
            ))}
          </div>
        ) : recent.length === 0 ? (
          <p className="card p-6 text-sm text-muted">Nothing watched yet.</p>
        ) : (
          <ul className="space-y-2">
            {recent.map((video) => (
              <li key={video.youtubeVideoId} className="card card-hover flex items-center gap-3 p-2.5">
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img
                  src={`https://i.ytimg.com/vi/${video.youtubeVideoId}/mqdefault.jpg`}
                  alt=""
                  className="h-11 w-[4.6rem] shrink-0 rounded-lg object-cover"
                  loading="lazy"
                />
                <div className="min-w-0 flex-1">
                  <p className="truncate text-sm font-medium">
                    {video.title || video.youtubeVideoId}
                  </p>
                  <p className="truncate text-xs text-muted">{video.channelName}</p>
                </div>
                <span className="stat shrink-0 pr-1 text-sm font-semibold">
                  {formatPercentage(video.watchedPercentage)}
                  <span className="ml-1 text-xs font-normal text-muted">actual</span>
                </span>
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  );
}

function greeting(): string {
  const hour = new Date().getHours();
  if (hour < 12) return 'Good morning';
  if (hour < 18) return 'Good afternoon';
  return 'Good evening';
}
