'use client';

import { useCallback, useEffect, useState } from 'react';

import { useStatsRefresh } from '@/components/AppShell';
import { TodayStats } from '@/components/StatCards';
import { TrackingNotice } from '@/components/TrackingNotice';
import { WeeklyChart } from '@/components/WeeklyChart';
import type { DayStats } from '@/lib/types';

/** Background refresh cadence for the dashboard numbers. */
const STATS_REFRESH_MS = 60_000;

/**
 * Today's and this week's figures.
 *
 * Deliberately knows nothing about the player: it re-fetches on a timer and
 * whenever the shell signals that a session opened. Every call here can fail
 * and the video keeps playing — on error the last good numbers simply stay on
 * screen rather than being replaced by an error banner.
 */
export function DashboardStats() {
  const refreshSignal = useStatsRefresh();
  const [today, setToday] = useState<DayStats | null>(null);
  const [week, setWeek] = useState<DayStats[]>([]);

  const refreshStats = useCallback(async () => {
    const tz = Intl.DateTimeFormat().resolvedOptions().timeZone;
    try {
      // Sequential, not Promise.all: two parallel requests each take a pooled
      // database connection, and there is nothing to gain from racing them.
      const todayResponse = await fetch(`/api/stats/today?tz=${encodeURIComponent(tz)}`);
      if (todayResponse.ok) setToday(((await todayResponse.json()) as { stats: DayStats }).stats);

      const weekResponse = await fetch(`/api/stats/weekly?tz=${encodeURIComponent(tz)}`);
      if (weekResponse.ok) setWeek(((await weekResponse.json()) as { days: DayStats[] }).days);
    } catch {
      // Keep whatever we last had. Stale numbers beat an error banner.
    }
  }, []);

  useEffect(() => {
    void refreshStats();
    const interval = setInterval(() => void refreshStats(), STATS_REFRESH_MS);
    return () => clearInterval(interval);
  }, [refreshStats, refreshSignal]);

  return (
    <div className="space-y-6">
      <TrackingNotice />
      <TodayStats stats={today} />
      <WeeklyChart days={week} />
    </div>
  );
}
