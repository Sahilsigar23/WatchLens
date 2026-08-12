'use client';

import { useCallback, useEffect, useState } from 'react';

import { useStatsRefresh } from '@/components/AppShell';
import { TodayStats } from '@/components/StatCards';
import type { DayStats } from '@/lib/types';

/** Background refresh cadence while the section is open. */
const REFRESH_MS = 60_000;

/**
 * Today's figures.
 *
 * Knows nothing about the player: it re-fetches on a timer and whenever the
 * shell signals a new session. Every call here can fail and the video keeps
 * playing — on error the last good numbers stay on screen rather than being
 * replaced by an error banner.
 */
export function TodayPanel() {
  const refreshSignal = useStatsRefresh();
  const [stats, setStats] = useState<DayStats | null>(null);

  const refresh = useCallback(async () => {
    const tz = Intl.DateTimeFormat().resolvedOptions().timeZone;
    try {
      const response = await fetch(`/api/stats/today?tz=${encodeURIComponent(tz)}`);
      if (response.ok) setStats(((await response.json()) as { stats: DayStats }).stats);
    } catch {
      // Keep whatever we last had.
    }
  }, []);

  useEffect(() => {
    void refresh();
    const interval = setInterval(() => void refresh(), REFRESH_MS);
    return () => clearInterval(interval);
  }, [refresh, refreshSignal]);

  return <TodayStats stats={stats} />;
}
