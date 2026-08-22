'use client';

import { useCallback, useEffect, useState } from 'react';

import { useStatsRefresh } from '@/components/AppShell';
import { HOUR_TICKS, HourStrip, Ratio } from '@/components/Coverage';
import { Figure } from '@/components/Figure';
import { Icon } from '@/components/Icon';
import { formatDuration, WEEKDAY_LABELS } from '@/lib/format';
import type { DayStats, HistoryRow } from '@/lib/types';

const REFRESH_MS = 60_000;

interface WeeklyResponse {
  days: DayStats[];
  streakDays: number;
  /** Seven rows of 24 hourly totals. Absent on an older deployment. */
  hourly?: number[][];
}

/**
 * Weekly activity.
 *
 * The centrepiece is a habit raster: seven days stacked on one shared 24-hour
 * axis, every hour lit in proportion to what was genuinely watched. Seven summed
 * columns tell you *how much*; this tells you *when*, and the vertical bands that
 * emerge are the actual finding — the hours you reliably study.
 *
 * All of it is plain divs. Seven times twenty-four values does not justify
 * shipping a charting library, and keeping one out means the bundle that loads
 * alongside the player stays small.
 */
export function WeeklyPanel() {
  const refreshSignal = useStatsRefresh();
  const [days, setDays] = useState<DayStats[] | null>(null);
  const [hourly, setHourly] = useState<number[][] | null>(null);
  const [streak, setStreak] = useState(0);
  const [topChannels, setTopChannels] = useState<{ name: string; seconds: number }[]>([]);

  const refresh = useCallback(async () => {
    const tz = Intl.DateTimeFormat().resolvedOptions().timeZone;
    try {
      const response = await fetch(`/api/stats/weekly?tz=${encodeURIComponent(tz)}`);
      if (response.ok) {
        const data = (await response.json()) as WeeklyResponse;
        setDays(data.days);
        setStreak(data.streakDays ?? 0);
        setHourly(data.hourly ?? null);
      }

      const history = await fetch('/api/user/history?limit=200');
      if (history.ok) {
        const { videos } = (await history.json()) as { videos: HistoryRow[] };
        const byChannel = new Map<string, number>();
        for (const video of videos) {
          if (!video.channelName) continue;
          byChannel.set(
            video.channelName,
            (byChannel.get(video.channelName) ?? 0) + video.watchedSeconds,
          );
        }
        setTopChannels(
          [...byChannel]
            .map(([name, seconds]) => ({ name, seconds }))
            .sort((a, b) => b.seconds - a.seconds)
            .slice(0, 5),
        );
      }
    } catch {
      // Keep whatever we last had.
    }
  }, []);

  useEffect(() => {
    void refresh();
    const interval = setInterval(() => void refresh(), REFRESH_MS);
    return () => clearInterval(interval);
  }, [refresh, refreshSignal]);

  const loading = days === null;
  const sum = (pick: (day: DayStats) => number) =>
    (days ?? []).reduce((total, day) => total + pick(day), 0);

  const watched = sum((d) => d.watchedSeconds);
  const skipped = sum((d) => d.skippedSeconds);
  const study = sum((d) => d.studySeconds);
  const entertainment = sum((d) => d.entertainmentSeconds);
  const other = sum((d) => d.otherSeconds);
  const videos = sum((d) => d.videoCount);

  const todayIndex = (new Date().getDay() + 6) % 7;

  /*
   * The average is over days *elapsed*, not seven. Dividing by seven mid-week
   * would always report a shortfall and make the comparison meaningless.
   */
  const elapsed = todayIndex + 1;
  const average = elapsed > 0 ? watched / elapsed : 0;
  const todayWatched = days?.[todayIndex]?.watchedSeconds ?? 0;
  const delta = todayWatched - average;

  /* One scale across every row, so a quiet day looks quiet. */
  const rasterPeak = Math.max(1, ...(hourly ?? []).flat());
  const busiestDay = days
    ? days.reduce((best, day, i) => (day.watchedSeconds > (days[best]?.watchedSeconds ?? 0) ? i : best), 0)
    : 0;

  return (
    <div className="space-y-6 md:space-y-8">
      <header className="flex flex-wrap items-end justify-between gap-x-6 gap-y-2">
        <div>
          <p className="eyebrow">Monday to Sunday · your timezone</p>
          <h1 className="display mt-1 text-3xl sm:text-4xl">This week</h1>
        </div>
        {days && days.length === 7 && (
          <p className="data text-xs text-dim sm:text-sm">
            {rangeLabel(days[0].date, days[6].date)}
          </p>
        )}
      </header>

      {/* ---- the measurement ------------------------------------------------ */}
      <section className="panel overflow-hidden">
        <div className="grid gap-px bg-rule md:grid-cols-[minmax(0,1fr)_minmax(14rem,19rem)]">
          <div className="bg-panel p-5 sm:p-6">
            <p className="eyebrow">Actually watched</p>
            <div className="mt-2">
              {loading ? (
                <div className="skeleton h-14 w-44" />
              ) : (
                <Figure value={formatDuration(watched)} size="lg" tone="signal" />
              )}
            </div>

            <div className="mt-5">
              {loading ? (
                <div className="skeleton h-2 w-full" />
              ) : (
                <Ratio
                  watchedSeconds={watched}
                  skippedSeconds={skipped}
                  totalSeconds={watched + skipped}
                  height="h-2"
                />
              )}
              <p className="mt-2.5 text-sm text-dim">
                {loading ? (
                  <span className="skeleton inline-block h-4 w-56 align-middle" />
                ) : watched === 0 ? (
                  'Nothing watched this week yet.'
                ) : (
                  <>
                    <span className="data text-text">{formatDuration(skipped)}</span> skipped ·{' '}
                    <span className="data text-text">{formatDuration(average)}</span> a day on
                    average
                  </>
                )}
              </p>
            </div>
          </div>

          <div className="grid grid-cols-3 gap-px bg-rule md:grid-cols-1">
            <Fact label="Videos" value={loading ? null : String(videos)} />
            <Fact
              label="Streak"
              value={loading ? null : streak > 0 ? `${streak}d` : '—'}
              icon={!loading && streak > 0 ? 'flame' : undefined}
            />
            {/*
              `null` means "still loading" and renders a shimmer, so a value
              that will never arrive has to be an em dash instead — otherwise an
              empty week shows a skeleton that pulses forever.
            */}
            <Fact
              label="Today vs avg"
              value={
                loading
                  ? null
                  : watched === 0
                    ? '—'
                    : `${delta >= 0 ? '+' : '−'}${formatDuration(Math.abs(delta))}`
              }
              tone={watched === 0 ? 'dim' : delta >= 0 ? 'signal' : 'dim'}
            />
          </div>
        </div>
      </section>

      {/* ---- the raster ------------------------------------------------------ */}
      <section>
        <div className="mb-3 flex items-baseline justify-between gap-4">
          <h2 className="display text-base">Weekly rhythm</h2>
          <span className="eyebrow">By hour</span>
        </div>

        <div className="panel p-4 sm:p-5">
          {loading ? (
            <div className="space-y-2">
              {WEEKDAY_LABELS.map((day) => (
                <div key={day} className="skeleton h-7 w-full" />
              ))}
            </div>
          ) : hourly === null ? (
            /* An older deployment has no per-day hourly data. Fall back to a
               plain daily comparison rather than showing nothing. */
            <DailyFallback days={days} todayIndex={todayIndex} />
          ) : (
            <>
              <ul className="space-y-1.5">
                {days.map((day, index) => (
                  <li key={day.date} className="flex items-center gap-2 sm:gap-3">
                    <span
                      className={`data w-8 shrink-0 text-[0.6875rem] uppercase sm:w-9 ${
                        index === todayIndex ? 'text-signal' : 'text-dim'
                      }`}
                    >
                      {WEEKDAY_LABELS[index]}
                    </span>

                    <div className="min-w-0 flex-1">
                      <HourStrip
                        hourly={hourly[index] ?? []}
                        peak={rasterPeak}
                        height="h-6 sm:h-7"
                        label={WEEKDAY_LABELS[index]}
                      />
                    </div>

                    <span
                      className={`data w-14 shrink-0 text-right text-[0.6875rem] sm:w-16 sm:text-xs ${
                        day.watchedSeconds > 0 ? 'text-text' : 'text-dim'
                      }`}
                    >
                      {day.watchedSeconds > 0 ? formatDuration(day.watchedSeconds) : '—'}
                    </span>
                  </li>
                ))}
              </ul>

              {/* The axis belongs under the strips, offset past the day column. */}
              <div className="mt-2 flex items-center gap-2 sm:gap-3">
                <span className="w-8 shrink-0 sm:w-9" />
                <div className="data flex min-w-0 flex-1 justify-between text-[0.625rem] text-dim">
                  {HOUR_TICKS.map((hour) => (
                    <span key={hour}>{String(hour % 24).padStart(2, '0')}</span>
                  ))}
                </div>
                <span className="w-14 shrink-0 sm:w-16" />
              </div>

              {watched > 0 && (
                <p className="mt-4 border-t border-rule pt-3 text-xs text-dim">
                  Busiest day was{' '}
                  <span className="text-text">{WEEKDAY_LABELS[busiestDay]}</span> at{' '}
                  <span className="data text-text">
                    {formatDuration(days[busiestDay].watchedSeconds)}
                  </span>
                  .
                </p>
              )}
            </>
          )}
        </div>
      </section>

      {/*
        The split and the channel list are both short blocks; side by side from
        `lg` they fill the width instead of each being stretched across it.
      */}
      <div className="grid gap-6 lg:grid-cols-2 lg:gap-6">
      {/* ---- the split ------------------------------------------------------- */}
      {!loading && watched > 0 && (
        <section className="min-w-0">
          <div className="mb-3 flex items-baseline justify-between gap-4">
            <h2 className="display text-base">What you watched</h2>
            <span className="eyebrow">By category</span>
          </div>

          <div className="panel p-4 sm:p-5">
            <div className="track flex h-2.5 gap-px">
              {(
                [
                  ['study', study],
                  ['fun', entertainment],
                  ['other', other],
                ] as const
              ).map(([kind, seconds]) =>
                seconds > 0 ? (
                  <span
                    key={kind}
                    className="animate-wipe h-full"
                    style={{
                      width: `${(seconds / (study + entertainment + other)) * 100}%`,
                      backgroundColor: `var(--color-${kind})`,
                    }}
                  />
                ) : null,
              )}
            </div>

            <dl className="mt-4 grid grid-cols-3 gap-4">
              <Split label="Learning" seconds={study} kind="study" />
              <Split label="Entertainment" seconds={entertainment} kind="fun" />
              <Split label="Other" seconds={other} kind="other" />
            </dl>
          </div>
        </section>
      )}

      {/* ---- channels -------------------------------------------------------- */}
      {topChannels.length > 0 && (
        <section className="min-w-0">
          <div className="mb-3 flex items-baseline justify-between gap-4">
            <h2 className="display text-base">Most watched channels</h2>
            <span className="eyebrow">All time</span>
          </div>

          <ul className="panel divide-y divide-rule">
            {topChannels.map((channel) => (
              <li key={channel.name} className="flex items-center gap-3 px-4 py-3 sm:px-5">
                <span className="min-w-0 flex-1 truncate text-sm">{channel.name}</span>
                <div className="hidden w-24 shrink-0 sm:block md:w-40">
                  <div className="track h-1.5">
                    <span
                      className="track-run animate-wipe"
                      style={{
                        left: 0,
                        width: `${(channel.seconds / topChannels[0].seconds) * 100}%`,
                      }}
                    />
                  </div>
                </div>
                <span className="data w-14 shrink-0 text-right text-xs text-dim sm:w-16">
                  {formatDuration(channel.seconds)}
                </span>
              </li>
            ))}
          </ul>
        </section>
      )}
      </div>
    </div>
  );
}

function Fact({
  label,
  value,
  icon,
  tone = 'default',
}: {
  label: string;
  value: string | null;
  icon?: 'flame';
  tone?: 'default' | 'signal' | 'dim';
}) {
  return (
    <div className="flex flex-col justify-center bg-panel px-4 py-4 sm:px-5">
      {/* Two lines reserved so "Today vs avg" wrapping does not drop its value
          below the neighbouring ones. */}
      <p className="eyebrow min-h-[2.1em] leading-snug md:min-h-0">{label}</p>
      {value === null ? (
        <div className="skeleton mt-1.5 h-6 w-12" />
      ) : (
        <p
          className={`data mt-1 flex items-center gap-1.5 text-xl font-medium sm:text-2xl ${
            tone === 'signal' ? 'text-signal' : tone === 'dim' ? 'text-dim' : 'text-text'
          }`}
        >
          {icon === 'flame' && (
            <span className="text-signal">
              <Icon name="flame" size={16} />
            </span>
          )}
          {value}
        </p>
      )}
    </div>
  );
}

function Split({
  label,
  seconds,
  kind,
}: {
  label: string;
  seconds: number;
  kind: 'study' | 'fun' | 'other';
}) {
  return (
    <div className="min-w-0">
      {/* `items-start` + no truncation: at 375px "Entertainment" needs to wrap
          onto a second line rather than clip to "Entertain…". */}
      <dt className="flex items-start gap-1.5">
        <span
          aria-hidden
          className="mt-[0.3rem] h-2 w-2 shrink-0 rounded-[1px]"
          style={{ backgroundColor: `var(--color-${kind})` }}
        />
        <span className="eyebrow leading-snug">{label}</span>
      </dt>
      <dd className="data mt-1 text-base font-medium sm:text-lg">{formatDuration(seconds)}</dd>
    </div>
  );
}

/** Seven columns, used only when the API predates per-day hourly data. */
function DailyFallback({ days, todayIndex }: { days: DayStats[]; todayIndex: number }) {
  const peak = Math.max(1, ...days.map((d) => d.watchedSeconds));

  return (
    <div className="flex h-40 items-end gap-2 sm:gap-3">
      {days.map((day, index) => (
        <div key={day.date} className="flex min-w-0 flex-1 flex-col items-center gap-2">
          <span className="data text-[0.625rem] text-dim">
            {day.watchedSeconds > 0 ? formatDuration(day.watchedSeconds) : ''}
          </span>
          <div className="flex w-full flex-1 items-end">
            <div
              className="animate-wipe-y w-full rounded-sm"
              style={{
                height: `${Math.max(day.watchedSeconds > 0 ? 4 : 2, (day.watchedSeconds / peak) * 100)}%`,
                backgroundColor:
                  day.watchedSeconds > 0 ? 'var(--color-signal)' : 'var(--color-ghost)',
              }}
            />
          </div>
          <span
            className={`data text-[0.6875rem] uppercase ${
              index === todayIndex ? 'text-signal' : 'text-dim'
            }`}
          >
            {WEEKDAY_LABELS[index]}
          </span>
        </div>
      ))}
    </div>
  );
}

/** `2026-08-17`, `2026-08-23` -> `17 – 23 AUG`. */
function rangeLabel(from: string, to: string): string {
  const start = new Date(`${from}T00:00:00`);
  const end = new Date(`${to}T00:00:00`);
  const month = (date: Date) =>
    date.toLocaleDateString(undefined, { month: 'short' }).toUpperCase();

  return start.getMonth() === end.getMonth()
    ? `${start.getDate()} – ${end.getDate()} ${month(end)}`
    : `${start.getDate()} ${month(start)} – ${end.getDate()} ${month(end)}`;
}
