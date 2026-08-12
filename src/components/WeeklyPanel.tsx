'use client';

import { useCallback, useEffect, useState } from 'react';

import { useStatsRefresh } from '@/components/AppShell';
import { Icon } from '@/components/Icon';
import { StatTile } from '@/components/StatTile';
import { formatDuration, WEEKDAY_LABELS } from '@/lib/format';
import type { DayStats, HistoryRow } from '@/lib/types';

const REFRESH_MS = 60_000;

/**
 * Weekly activity.
 *
 * The bars are plain divs rather than a charting library: seven values do not
 * justify shipping one, and keeping it out means the bundle that loads
 * alongside the player stays small.
 */
export function WeeklyPanel() {
  const refreshSignal = useStatsRefresh();
  const [days, setDays] = useState<DayStats[] | null>(null);
  const [streak, setStreak] = useState(0);
  const [topChannels, setTopChannels] = useState<{ name: string; seconds: number }[]>([]);

  const refresh = useCallback(async () => {
    const tz = Intl.DateTimeFormat().resolvedOptions().timeZone;
    try {
      const response = await fetch(`/api/stats/weekly?tz=${encodeURIComponent(tz)}`);
      if (response.ok) {
        const data = (await response.json()) as { days: DayStats[]; streakDays: number };
        setDays(data.days);
        setStreak(data.streakDays ?? 0);
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

  const total = (pick: (day: DayStats) => number) =>
    (days ?? []).reduce((sum, d) => sum + pick(d), 0);

  const watched = total((d) => d.watchedSeconds);
  const peak = Math.max(1, ...(days ?? []).map((d) => d.watchedSeconds));
  const todayIndex = (new Date().getDay() + 6) % 7;

  return (
    <div className="space-y-8">
      <header className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight sm:text-3xl">Weekly learning</h1>
          <p className="mt-1 text-sm text-muted">Monday to Sunday, in your timezone.</p>
        </div>

        <div className="text-right">
          <p className="stat gradient-text text-3xl font-semibold sm:text-4xl">
            {days === null ? '—' : formatDuration(watched)}
          </p>
          <p className="text-xs uppercase tracking-wide text-muted">Actual time</p>
        </div>
      </header>

      <section className="card p-5">
        {days === null ? (
          <div className="skeleton h-44 w-full" />
        ) : (
          <>
            <div className="flex h-44 items-end gap-2 sm:gap-3">
              {days.map((day, index) => {
                const height = (day.watchedSeconds / peak) * 100;
                const isToday = index === todayIndex;
                return (
                  <div key={day.date} className="flex min-w-0 flex-1 flex-col items-center gap-2">
                    <span className="stat text-[0.65rem] text-muted">
                      {day.watchedSeconds > 0 ? formatDuration(day.watchedSeconds) : ''}
                    </span>
                    <div className="flex w-full flex-1 items-end">
                      <div
                        className="animate-grow-y w-full rounded-lg"
                        style={{
                          height: `${Math.max(day.watchedSeconds > 0 ? 4 : 2, height)}%`,
                          backgroundImage:
                            day.watchedSeconds > 0
                              ? 'linear-gradient(180deg, var(--color-accent), var(--color-brand))'
                              : undefined,
                          backgroundColor:
                            day.watchedSeconds > 0 ? undefined : 'var(--color-line)',
                        }}
                        title={`${WEEKDAY_LABELS[index]} — ${formatDuration(day.watchedSeconds)}`}
                      />
                    </div>
                    <span
                      className={`text-xs ${isToday ? 'font-semibold text-ink' : 'text-muted'}`}
                    >
                      {WEEKDAY_LABELS[index]}
                    </span>
                  </div>
                );
              })}
            </div>

            {streak > 0 && (
              <p className="mt-5 flex items-center justify-center gap-2 text-sm">
                <span style={{ color: 'var(--color-fun)' }}>
                  <Icon name="flame" size={16} />
                </span>
                <span className="font-medium">{streak}-day streak</span>
                <span className="text-muted">· keep it going</span>
              </p>
            )}
          </>
        )}
      </section>

      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <StatTile
          label="Learning"
          value={days === null ? null : formatDuration(total((d) => d.studySeconds))}
          icon="sparkle"
          accent="study"
        />
        <StatTile
          label="Entertainment"
          value={days === null ? null : formatDuration(total((d) => d.entertainmentSeconds))}
          icon="play"
          accent="fun"
        />
        <StatTile
          label="Skipped"
          value={days === null ? null : formatDuration(total((d) => d.skippedSeconds))}
          icon="chevronRight"
          accent="skip"
        />
        <StatTile
          label="Videos"
          value={days === null ? null : String(total((d) => d.videoCount))}
          icon="list"
        />
      </div>

      {topChannels.length > 0 && (
        <section className="space-y-3">
          <h2 className="text-sm font-semibold">Most watched channels</h2>
          <ul className="card divide-y divide-line">
            {topChannels.map((channel) => (
              <li key={channel.name} className="flex items-center gap-3 px-4 py-3">
                <span className="min-w-0 flex-1 truncate text-sm">{channel.name}</span>
                <div className="hidden h-1.5 w-32 overflow-hidden rounded-full bg-canvas sm:block">
                  <div
                    className="animate-grow h-full rounded-full"
                    style={{
                      width: `${(channel.seconds / topChannels[0].seconds) * 100}%`,
                      backgroundImage:
                        'linear-gradient(90deg, var(--color-brand), var(--color-accent))',
                    }}
                  />
                </div>
                <span className="stat shrink-0 text-sm text-muted">
                  {formatDuration(channel.seconds)}
                </span>
              </li>
            ))}
          </ul>
          <p className="text-xs text-muted">All-time, by actual watch time.</p>
        </section>
      )}
    </div>
  );
}
