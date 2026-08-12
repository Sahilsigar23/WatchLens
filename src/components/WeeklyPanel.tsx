'use client';

import { useCallback, useEffect, useState } from 'react';

import { useStatsRefresh } from '@/components/AppShell';
import { WeeklyChart } from '@/components/WeeklyChart';
import { formatDuration } from '@/lib/format';
import type { DayStats } from '@/lib/types';

const REFRESH_MS = 60_000;

/** Monday-to-Sunday activity, plus the week's totals. */
export function WeeklyPanel() {
  const refreshSignal = useStatsRefresh();
  const [days, setDays] = useState<DayStats[]>([]);

  const refresh = useCallback(async () => {
    const tz = Intl.DateTimeFormat().resolvedOptions().timeZone;
    try {
      const response = await fetch(`/api/stats/weekly?tz=${encodeURIComponent(tz)}`);
      if (response.ok) setDays(((await response.json()) as { days: DayStats[] }).days);
    } catch {
      // Keep whatever we last had.
    }
  }, []);

  useEffect(() => {
    void refresh();
    const interval = setInterval(() => void refresh(), REFRESH_MS);
    return () => clearInterval(interval);
  }, [refresh, refreshSignal]);

  const total = (pick: (day: DayStats) => number) => days.reduce((sum, d) => sum + pick(d), 0);

  return (
    <div className="space-y-4">
      <WeeklyChart days={days} />

      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        <Total label="Actual watched" value={total((d) => d.watchedSeconds)} />
        <Total label="Study" value={total((d) => d.studySeconds)} accent="var(--color-study)" />
        <Total
          label="Entertainment"
          value={total((d) => d.entertainmentSeconds)}
          accent="var(--color-fun)"
        />
        <Total
          label="Skipped"
          value={total((d) => d.skippedSeconds)}
          accent="var(--color-skip)"
        />
      </div>
    </div>
  );
}

function Total({ label, value, accent }: { label: string; value: number; accent?: string }) {
  return (
    <div className="card p-4">
      <p className="text-xs font-medium uppercase tracking-wide text-muted">{label}</p>
      <p
        className="mt-1.5 text-2xl font-semibold tabular-nums"
        style={accent ? { color: accent } : undefined}
      >
        {formatDuration(value)}
      </p>
    </div>
  );
}
