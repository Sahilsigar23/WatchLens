'use client';

import {
  Bar,
  BarChart,
  CartesianGrid,
  Legend,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts';

import { formatDuration, WEEKDAY_LABELS } from '@/lib/format';
import type { DayStats } from '@/lib/types';

/**
 * Monday-to-Sunday activity, stacked by category.
 *
 * The three segments add up to actual watched time, so the bar height *is* the
 * day's real watch time — skipped time is deliberately not part of the stack,
 * because it was never watched.
 */
export function WeeklyChart({ days }: { days: DayStats[] }) {
  const data = days.map((day, index) => ({
    day: WEEKDAY_LABELS[index] ?? day.date.slice(5),
    Study: Math.round(day.studySeconds / 60),
    Entertainment: Math.round(day.entertainmentSeconds / 60),
    Other: Math.round(day.otherSeconds / 60),
    watchedSeconds: day.watchedSeconds,
  }));

  const hasData = data.some((d) => d.Study + d.Entertainment + d.Other > 0);

  return (
    <section className="space-y-3">
      <div className="flex items-baseline justify-between">
        <h2 className="text-sm font-semibold text-muted">Weekly activity</h2>
        <span className="text-xs text-muted">minutes actually watched</span>
      </div>

      <div className="card p-4">
        {hasData ? (
          // `overflow-hidden`: Recharts sizes its legend wrapper in inline
          // pixels and does not shrink it when the viewport does, so a device
          // rotation can otherwise leave a legend wider than the page.
          <div className="h-64 w-full overflow-hidden">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={data} margin={{ top: 8, right: 8, bottom: 0, left: -20 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="var(--color-line)" vertical={false} />
                <XAxis
                  dataKey="day"
                  tickLine={false}
                  axisLine={false}
                  tick={{ fill: 'var(--color-muted)', fontSize: 12 }}
                />
                <YAxis
                  tickLine={false}
                  axisLine={false}
                  tick={{ fill: 'var(--color-muted)', fontSize: 12 }}
                />
                <Tooltip
                  cursor={{ fill: 'var(--color-canvas)' }}
                  contentStyle={{
                    background: 'var(--color-surface)',
                    border: '1px solid var(--color-line)',
                    borderRadius: '0.5rem',
                    color: 'var(--color-ink)',
                    fontSize: 12,
                  }}
                  formatter={(value: number, name: string) => [`${value} min`, name]}
                />
                <Legend wrapperStyle={{ fontSize: 12 }} />
                <Bar dataKey="Study" stackId="a" fill="var(--color-study)" radius={[0, 0, 0, 0]} />
                <Bar dataKey="Entertainment" stackId="a" fill="var(--color-fun)" />
                <Bar dataKey="Other" stackId="a" fill="var(--color-other)" radius={[4, 4, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          </div>
        ) : (
          <p className="py-12 text-center text-sm text-muted">
            Nothing tracked this week yet. Watch a video above and it will show up here.
          </p>
        )}

        <p className="mt-2 text-center text-xs text-muted">
          Total this week: {formatDuration(days.reduce((sum, d) => sum + d.watchedSeconds, 0))}
        </p>
      </div>
    </section>
  );
}
