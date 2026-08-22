'use client';

import { useCallback, useEffect, useState } from 'react';

import { useStatsRefresh } from '@/components/AppShell';
import { HourAxis, HourStrip, Ratio } from '@/components/Coverage';
import { Figure } from '@/components/Figure';
import { Icon } from '@/components/Icon';
import { formatDuration, formatPercentage } from '@/lib/format';
import type { DayStats, HistoryRow } from '@/lib/types';

/** Background refresh cadence while the section is open. */
const REFRESH_MS = 60_000;

/**
 * Today.
 *
 * Built around one measurement — how much you genuinely watched — and then the
 * two questions that follow from it: *when* (the 24-hour raster) and *what* (the
 * session list). Deliberately not a grid of four equal tiles: the figures are
 * not equally important, and laying them out as if they were is what makes an
 * analytics page read as a template.
 */
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

      const history = await fetch('/api/user/history?limit=6');
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

  /*
   * The greeting and the date are functions of the *viewer's* clock, which the
   * server does not share. Rendering them during SSR produces a hydration
   * mismatch whenever the server's timezone differs from the browser's, so they
   * are held back until after mount — one frame later, and always correct.
   */
  const [mounted, setMounted] = useState(false);
  useEffect(() => setMounted(true), []);

  const loading = stats === null;
  const activeHours = (hourly ?? []).filter((seconds) => seconds > 0).length;
  const peakHour =
    hourly && activeHours > 0 ? hourly.indexOf(Math.max(...hourly)) : null;
  const firstActiveHour = (hourly ?? []).findIndex((seconds) => seconds > 0);
  const lastActiveHour = (hourly ?? []).reduce(
    (last, seconds, hour) => (seconds > 0 ? hour : last),
    0,
  );

  return (
    <div className="space-y-6 md:space-y-8">
      <header className="flex flex-wrap items-end justify-between gap-x-6 gap-y-2">
        <div>
          {/* `min-h` reserves the line so the header does not shift when the
              greeting appears after mount. */}
          <p className="eyebrow min-h-4">
            {mounted ? `${greeting()}${name ? ` · ${name}` : ''}` : ' '}
          </p>
          <h1 className="display mt-1 text-3xl sm:text-4xl">Today</h1>
        </div>
        <p className="data min-h-4 text-xs text-dim sm:text-sm">
          {mounted ? todayLabel() : ' '}
        </p>
      </header>

      {/* ---- the measurement ------------------------------------------------ */}
      <section className="panel overflow-hidden">
        <div className="grid gap-px bg-rule md:grid-cols-[minmax(0,1fr)_minmax(14rem,19rem)]">
          <div className="bg-panel p-5 sm:p-6">
            <p className="eyebrow">Actually watched</p>
            <div className="mt-2">
              {loading ? (
                <div className="skeleton h-14 w-40" />
              ) : (
                <Figure value={formatDuration(stats.watchedSeconds)} size="lg" tone="signal" />
              )}
            </div>

            <div className="mt-5">
              {loading ? (
                <div className="skeleton h-1.5 w-full" />
              ) : (
                <Ratio
                  watchedSeconds={stats.watchedSeconds}
                  skippedSeconds={stats.skippedSeconds}
                  totalSeconds={stats.watchedSeconds + stats.skippedSeconds}
                  height="h-2"
                />
              )}
              <p className="mt-2.5 text-sm text-dim">
                {loading ? (
                  <span className="skeleton inline-block h-4 w-52 align-middle" />
                ) : stats.watchedSeconds === 0 ? (
                  'Nothing watched yet today.'
                ) : (
                  <>
                    <span className="data text-text">{formatDuration(stats.skippedSeconds)}</span>{' '}
                    skipped past ·{' '}
                    <span className="data text-text">
                      {formatPercentage(stats.averageWatchedPercentage)}
                    </span>{' '}
                    average coverage
                  </>
                )}
              </p>
            </div>
          </div>

          {/* Supporting counts. Three facts, not a wall of tiles. */}
          <div className="grid grid-cols-3 gap-px bg-rule md:grid-cols-1">
            <Fact label="Videos" value={loading ? null : String(stats.videoCount)} />
            <Fact
              label="Active hours"
              value={loading || hourly === null ? null : String(activeHours)}
            />
            {/*
              `null` means "still loading" and renders a shimmer, so a day with
              no activity has to show an em dash instead — otherwise the tile
              pulses forever waiting for a value that will never come.
            */}
            <Fact
              label="Busiest"
              value={
                loading || hourly === null
                  ? null
                  : peakHour === null
                    ? '—'
                    : hourLabel(peakHour)
              }
            />
          </div>
        </div>
      </section>

      {/*
        Two columns from `lg`. The raster wants width (24 cells) and the session
        list wants a narrow measure, so stacking them full-width at 1248px
        stretches both. Side by side, each gets the proportion it reads best at.
      */}
      <div className="grid gap-6 lg:grid-cols-[minmax(0,1.15fr)_minmax(0,1fr)] lg:gap-6">
      {/*
        `min-w-0` on both items is load-bearing, not tidiness: a grid item
        defaults to `min-width: auto`, so it refuses to shrink below its
        content's min-content width. The 24-cell raster inside pushed the row
        to 476px on a 343px phone and the whole page scrolled sideways — the
        same trap documented in PlayerShell.
      */}
      {/* ---- when ----------------------------------------------------------- */}
      <section className="min-w-0">
        <div className="mb-3 flex items-baseline justify-between gap-4">
          <h2 className="display text-base">When you watched</h2>
          <span className="eyebrow">24 hours</span>
        </div>

        <div className="panel p-4 sm:p-5">
          {hourly === null ? (
            <div className="skeleton h-9 w-full" />
          ) : activeHours === 0 ? (
            <EmptyRow>Nothing watched yet today. Open something on the Watch page.</EmptyRow>
          ) : (
            <>
              <HourStrip
                hourly={hourly}
                peak={Math.max(...hourly)}
                height="h-14 sm:h-16"
                label="Today"
              />
              <HourAxis />

              {/* The span of the day, which the raster shows but does not
                  state. Reads straight off the first and last lit hour. */}
              <p className="mt-4 border-t border-rule pt-3 text-xs text-dim">
                Watched across <span className="text-text">{activeHours}</span>{' '}
                {activeHours === 1 ? 'hour' : 'hours'}, between{' '}
                <span className="data text-text">{hourLabel(firstActiveHour)}</span> and{' '}
                <span className="data text-text">{hourLabel(lastActiveHour)}</span>.
              </p>
            </>
          )}
        </div>
      </section>

      {/* ---- what ----------------------------------------------------------- */}
      <section className="min-w-0">
        <div className="mb-3 flex items-baseline justify-between gap-4">
          <h2 className="display text-base">Recently watched</h2>
          <span className="eyebrow">Coverage per video</span>
        </div>

        {recent === null ? (
          <div className="space-y-2">
            {[0, 1, 2].map((i) => (
              <div key={i} className="skeleton h-[4.5rem] w-full" />
            ))}
          </div>
        ) : recent.length === 0 ? (
          <EmptyRow>Nothing watched yet. Paste a YouTube link on the Watch page.</EmptyRow>
        ) : (
          <ul className="space-y-2">
            {recent.map((video) => (
              <li key={video.youtubeVideoId} className="panel panel-action p-2.5 sm:p-3">
                <div className="flex items-center gap-3">
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img
                    src={`https://i.ytimg.com/vi/${video.youtubeVideoId}/mqdefault.jpg`}
                    alt=""
                    className="h-11 w-[4.9rem] shrink-0 rounded-md object-cover sm:h-12 sm:w-[5.35rem]"
                    loading="lazy"
                  />

                  <div className="min-w-0 flex-1">
                    <p className="truncate text-sm font-medium">
                      {video.title || video.youtubeVideoId}
                    </p>
                    <p className="mt-0.5 truncate text-xs text-dim">
                      {video.channelName}
                      {video.sessionCount > 1 && (
                        <>
                          {' · '}
                          <span className="data">{video.sessionCount}</span> sessions
                        </>
                      )}
                    </p>
                  </div>

                  <div className="shrink-0 text-right">
                    <p className="data text-sm font-medium text-signal">
                      {formatDuration(video.watchedSeconds)}
                    </p>
                    <p className="data text-[0.6875rem] text-dim">
                      {formatPercentage(video.watchedPercentage)}
                    </p>
                  </div>
                </div>

                <div className="mt-2.5">
                  <Ratio
                    watchedSeconds={video.watchedSeconds}
                    skippedSeconds={video.skippedSeconds}
                    totalSeconds={video.durationSeconds}
                  />
                </div>
              </li>
            ))}
          </ul>
        )}
      </section>
      </div>
    </div>
  );
}

/** One supporting count beside the hero measurement. */
function Fact({ label, value }: { label: string; value: string | null }) {
  return (
    <div className="flex flex-col justify-center bg-panel px-4 py-4 sm:px-5">
      {/* Two lines are reserved for every label so the values sit on one
          baseline even when one of them wraps ("Active hours" at 375px). */}
      <p className="eyebrow min-h-[2.1em] leading-snug md:min-h-0">{label}</p>
      {value === null ? (
        <div className="skeleton mt-1.5 h-6 w-12" />
      ) : (
        <p className="data mt-1 text-xl font-medium sm:text-2xl">{value}</p>
      )}
    </div>
  );
}

function EmptyRow({ children }: { children: React.ReactNode }) {
  return (
    <div className="panel flex items-center gap-3 px-4 py-6 text-sm text-dim">
      <span className="shrink-0 text-ghost">
        <Icon name="clock" size={18} />
      </span>
      {children}
    </div>
  );
}

function greeting(): string {
  const hour = new Date().getHours();
  if (hour < 12) return 'Good morning';
  if (hour < 18) return 'Good afternoon';
  return 'Good evening';
}

/** `9` -> `"09:00"`. */
function hourLabel(hour: number): string {
  return `${String(Math.max(0, hour)).padStart(2, '0')}:00`;
}

function todayLabel(): string {
  return new Date()
    .toLocaleDateString(undefined, { weekday: 'short', day: '2-digit', month: 'short' })
    .toUpperCase();
}
