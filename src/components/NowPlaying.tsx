'use client';

import { Coverage } from '@/components/Coverage';
import { Icon } from '@/components/Icon';
import type { LiveStats } from '@/hooks/useWatchTracker';
import { formatPercentage, formatTimecode } from '@/lib/format';

/**
 * The information bar under the player: what is playing, and how much of it has
 * genuinely been watched.
 *
 * The coverage ribbon is the point of this component — it draws the video's
 * timeline to scale and shows exactly which stretches were played, which were
 * jumped over, and how far the playhead ever got. The four figures beneath are
 * the same truth as numbers.
 *
 * Everything here is computed in the browser from the same algorithm the server
 * uses, so the numbers keep updating even when the analytics API is
 * unreachable — and nothing here is on the player's critical path.
 */
export function NowPlaying({
  title,
  channelName,
  stats,
  saving,
  onResume,
  resumePosition,
}: {
  title: string;
  channelName: string;
  stats: LiveStats;
  saving: 'idle' | 'ok' | 'offline';
  onResume: () => void;
  resumePosition: number | null;
}) {
  const { durationSeconds, watchedSeconds, skippedSeconds, reachedSeconds, intervals } = stats;
  const known = durationSeconds > 0;
  const progress = known ? reachedSeconds / durationSeconds : 0;

  return (
    <section className="space-y-4">
      <div className="flex flex-wrap items-start justify-between gap-x-4 gap-y-3">
        {/* `basis-full` on a phone: the title gets the whole line and Continue
            wraps beneath it, instead of the two splitting the row and clipping
            the title to a few characters. */}
        <div className="min-w-0 basis-full sm:flex-1 sm:basis-auto">
          <h1 className="display truncate text-xl sm:text-2xl" title={title}>
            {title || 'Loading…'}
          </h1>
          <p className="mt-1 flex flex-wrap items-center gap-x-2 gap-y-1 text-sm text-dim">
            {channelName && <span className="truncate">{channelName}</span>}
            {channelName && known && <span aria-hidden>·</span>}
            {known && <span className="data">{formatTimecode(durationSeconds)}</span>}
            <TrackingStatus saving={saving} />
          </p>
        </div>

        {resumePosition !== null && (
          <button type="button" onClick={onResume} className="btn btn-quiet shrink-0">
            <Icon name="play" size={12} />
            Continue from <span className="data">{formatTimecode(resumePosition)}</span>
          </button>
        )}
      </div>

      <div className="panel p-4 sm:p-5">
        <div className="mb-3 flex flex-wrap items-center justify-between gap-x-4 gap-y-2">
          {/* "This session" matters: these figures are reset when a new video
              opens, and are not the video's all-time coverage. */}
          <span className="eyebrow">Coverage · this session</span>
          {intervals.length > 0 && <Legend />}
        </div>

        <Coverage
          intervals={intervals}
          durationSeconds={durationSeconds}
          reachedSeconds={reachedSeconds}
          height="h-3"
        />

        <div className="data mt-2 flex justify-between text-[0.625rem] text-dim">
          <span>0:00</span>
          <span>{known ? formatTimecode(durationSeconds) : '—'}</span>
        </div>

        {intervals.length === 0 && (
          <p className="mt-3 text-xs text-dim">
            Press play — the stretches you watch fill in here as you go.
          </p>
        )}

        <dl className="mt-5 grid grid-cols-2 gap-x-4 gap-y-4 border-t border-rule pt-4 sm:grid-cols-4">
          <Metric label="Actually watched" value={formatTimecode(watchedSeconds)} tone="signal" />
          <Metric label="Skipped" value={formatTimecode(skippedSeconds)} tone="dim" />
          <Metric label="Progress" value={known ? formatPercentage(progress) : '—'} />
          <Metric label="Length" value={known ? formatTimecode(durationSeconds) : '—'} tone="dim" />
        </dl>
      </div>
    </section>
  );
}

/**
 * Whether events are reaching the server. Worth showing plainly: the whole
 * value of the app is that the measurement is trustworthy, so a silent failure
 * to record would be the worst kind.
 */
function TrackingStatus({ saving }: { saving: 'idle' | 'ok' | 'offline' }) {
  const offline = saving === 'offline';

  return (
    <span className="inline-flex items-center gap-1.5">
      <span
        aria-hidden
        className="h-1.5 w-1.5 rounded-full"
        style={{ backgroundColor: offline ? 'var(--color-ghost)' : 'var(--color-signal)' }}
      />
      <span className="eyebrow text-[0.625rem]">{offline ? 'Not saving' : 'Tracking'}</span>
    </span>
  );
}

/** Makes the ribbon readable without a caption under every chart. */
function Legend() {
  return (
    <span className="flex items-center gap-3">
      <span className="flex items-center gap-1.5">
        <span aria-hidden className="h-2 w-4 rounded-[2px] bg-signal" />
        <span className="eyebrow text-[0.625rem]">Watched</span>
      </span>
      <span className="flex items-center gap-1.5">
        <span
          aria-hidden
          className="h-2 w-4 rounded-[2px]"
          style={{
            backgroundImage:
              'repeating-linear-gradient(-45deg, var(--color-ghost) 0 2px, transparent 2px 5px)',
          }}
        />
        <span className="eyebrow text-[0.625rem]">Skipped</span>
      </span>
    </span>
  );
}

function Metric({
  label,
  value,
  tone = 'default',
}: {
  label: string;
  value: string;
  tone?: 'default' | 'signal' | 'dim';
}) {
  return (
    <div className="min-w-0">
      {/* Two lines reserved: "Actually watched" wraps at 320px while "Skipped"
          does not, and without this the two values sit at different heights. */}
      <dt className="eyebrow min-h-[2.1em] leading-snug">{label}</dt>
      <dd
        className={`data mt-1 text-lg font-medium sm:text-xl ${
          tone === 'signal' ? 'text-signal' : tone === 'dim' ? 'text-dim' : 'text-text'
        }`}
      >
        {value}
      </dd>
    </div>
  );
}
