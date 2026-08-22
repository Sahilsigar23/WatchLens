import { Coverage } from '@/components/Coverage';
import { formatDuration, formatTimecode } from '@/lib/format';
import type { Interval } from '@/lib/types';

/**
 * The Watch page's opening figure — WatchLens's argument, drawn rather than
 * asserted.
 *
 * A progress bar and a coverage ribbon over the SAME 42 minutes, stacked on one
 * axis so they can be read against each other. The progress bar reaches 88%.
 * The ribbon says 54%. The gap between those two numbers is the entire product,
 * and putting the two tracks in register is the only way to make it obvious at a
 * glance — a single bar with a caption would just be a claim.
 *
 * The minute ruler underneath is what makes it read as a measurement rather than
 * a chart, and it is honest: every tick is a real minute of the example.
 *
 * A worked example throughout, not anyone's data, and labelled as such.
 */

const DURATION = 2520; // 42:00

/** The stretches genuinely played, in order. */
const RUNS: Interval[] = [
  { start: 0, end: 380 },
  { start: 700, end: 1180 },
  { start: 1180, end: 1460 },
  { start: 1980, end: 2210 },
];

const WATCHED = RUNS.reduce((total, run) => total + (run.end - run.start), 0);
/** Furthest point the playhead ever got — what a progress bar reports. */
const REACHED = RUNS[RUNS.length - 1].end;
const SKIPPED = REACHED - WATCHED;

const pct = (value: number) => Math.round((value / DURATION) * 100);

/** Minute marks, every fifth one full height. */
const MINUTES = Array.from({ length: DURATION / 60 + 1 }, (_, minute) => minute);

export function CoverageDemo() {
  return (
    <figure className="panel overflow-hidden p-4 sm:p-5">
      <figcaption className="eyebrow">A 42-minute video, measured twice</figcaption>

      {/*
        One reveal for both tracks so they are read as a pair, with a recording
        head running ahead of it. Fires once on mount; `prefers-reduced-motion`
        collapses it to the finished state.
      */}
      <div className="animate-record relative mt-4">
        {/* ---- what a progress bar reports ---------------------------------- */}
        <Row label="Progress bar" value={`${pct(REACHED)}%`} tone="dim">
          <div className="track track-quiet h-2.5">
            <span
              className="absolute inset-y-0 left-0 rounded-[3px]"
              style={{
                width: `${(REACHED / DURATION) * 100}%`,
                backgroundColor: 'color-mix(in oklab, var(--color-dim) 42%, transparent)',
              }}
            />
            {/*
              The same playhead marker the ribbon below carries. Both tracks
              END AT THE SAME INSTANT — that is the point of the figure, and two
              hairlines in register say it without a caption.
            */}
            <span className="track-head" style={{ left: `${(REACHED / DURATION) * 100}%` }} />
          </div>
        </Row>

        {/* ---- what was actually played -------------------------------------- */}
        <div className="mt-4">
          <Row label="Actually watched" value={`${pct(WATCHED)}%`} tone="signal">
            <Coverage
              intervals={RUNS}
              durationSeconds={DURATION}
              reachedSeconds={REACHED}
              height="h-2.5"
              animate={false}
            />
          </Row>
        </div>

        {/* ---- the ruler ----------------------------------------------------- */}
        <div className="relative mt-1.5 h-3" aria-hidden>
          {MINUTES.map((minute) => (
            <span
              key={minute}
              className="absolute top-0 w-px"
              style={{
                left: `${(minute / (DURATION / 60)) * 100}%`,
                height: minute % 5 === 0 ? '0.625rem' : '0.3125rem',
                // Five-minute marks carry the scale, so they get enough weight
                // to be countable; the minute marks are texture behind them.
                backgroundColor:
                  minute % 5 === 0
                    ? 'color-mix(in oklab, var(--color-dim) 55%, transparent)'
                    : 'var(--color-rule)',
              }}
            />
          ))}
        </div>

        <div className="data mt-1 flex justify-between text-[0.625rem] text-dim" aria-hidden>
          <span>0:00</span>
          <span>{formatTimecode(DURATION / 2)}</span>
          <span>{formatTimecode(DURATION)}</span>
        </div>

        {/* The recording head, sweeping once across both tracks. */}
        <span
          aria-hidden
          className="animate-record-head pointer-events-none absolute top-0 bottom-6 w-px bg-signal"
        />
      </div>

      {/* ---- the reading ----------------------------------------------------- */}
      <p className="mt-4 border-t border-rule pt-3 text-xs leading-relaxed text-dim">
        <span className="data text-signal">{formatDuration(WATCHED)}</span> genuinely played;{' '}
        <span className="data text-text">{formatDuration(SKIPPED)}</span> fast-forwarded past. The
        progress bar counts both.
      </p>
    </figure>
  );
}

/** One labelled track: name and figure above, the bar itself below. */
function Row({
  label,
  value,
  tone,
  children,
}: {
  label: string;
  value: string;
  tone: 'signal' | 'dim';
  children: React.ReactNode;
}) {
  return (
    <div>
      <div className="mb-1.5 flex items-baseline justify-between gap-3">
        <span className="eyebrow">{label}</span>
        <span
          className={`data text-sm font-medium ${tone === 'signal' ? 'text-signal' : 'text-dim'}`}
        >
          {value}
        </span>
      </div>
      <div className="relative">{children}</div>
    </div>
  );
}
