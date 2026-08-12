import { formatDuration, formatPercentage } from '@/lib/format';
import type { DayStats } from '@/lib/types';

interface StatCardProps {
  label: string;
  value: string;
  hint?: string;
  accent?: string;
}

export function StatCard({ label, value, hint, accent }: StatCardProps) {
  return (
    <div className="card p-4">
      <p className="text-xs font-medium uppercase tracking-wide text-muted">{label}</p>
      <p className="mt-1.5 text-2xl font-semibold tabular-nums" style={accent ? { color: accent } : undefined}>
        {value}
      </p>
      {hint && <p className="mt-0.5 text-xs text-muted">{hint}</p>}
    </div>
  );
}

/** The "Today" strip: the three headline numbers plus the learning report. */
export function TodayStats({ stats }: { stats: DayStats | null }) {
  const s: DayStats = stats ?? {
    date: '',
    totalYoutubeSeconds: 0,
    watchedSeconds: 0,
    skippedSeconds: 0,
    studySeconds: 0,
    entertainmentSeconds: 0,
    otherSeconds: 0,
    videoCount: 0,
    studyVideoCount: 0,
    completedStudyVideoCount: 0,
    averageWatchedPercentage: 0,
  };

  const partiallyWatched = Math.max(0, s.studyVideoCount - s.completedStudyVideoCount);

  return (
    <section className="space-y-3">
      <h2 className="text-sm font-semibold text-muted">Today</h2>

      <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-5">
        <StatCard
          label="Actual watched"
          value={formatDuration(s.watchedSeconds)}
          hint="Video you really played"
        />
        <StatCard
          label="Study time"
          value={formatDuration(s.studySeconds)}
          accent="var(--color-study)"
        />
        <StatCard
          label="Skipped"
          value={formatDuration(s.skippedSeconds)}
          hint="Fast-forwarded past"
          accent="var(--color-skip)"
        />
        <StatCard
          label="Entertainment"
          value={formatDuration(s.entertainmentSeconds)}
          accent="var(--color-fun)"
        />
        <StatCard
          label="Videos"
          value={String(s.videoCount)}
          hint={`${formatDuration(s.totalYoutubeSeconds)} on site`}
        />
      </div>

      <div className="card p-4">
        <h3 className="text-sm font-semibold">Today&rsquo;s learning report</h3>
        <dl className="mt-3 grid grid-cols-2 gap-x-6 gap-y-2 text-sm sm:grid-cols-4">
          <Row label="Study videos" value={String(s.studyVideoCount)} />
          <Row label="Completed" value={String(s.completedStudyVideoCount)} />
          <Row label="Partially watched" value={String(partiallyWatched)} />
          <Row label="Average watched" value={formatPercentage(s.averageWatchedPercentage)} />
        </dl>
      </div>
    </section>
  );
}

function Row({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-baseline justify-between gap-2 sm:block">
      <dt className="text-muted">{label}</dt>
      <dd className="font-medium tabular-nums sm:mt-0.5">{value}</dd>
    </div>
  );
}
