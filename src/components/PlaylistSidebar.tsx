'use client';

import { memo } from 'react';

import { Ratio } from '@/components/Coverage';
import { Icon } from '@/components/Icon';
import { formatDuration, formatPercentage } from '@/lib/format';
import type { PlaylistItem, PlaylistSummary } from '@/lib/types';

interface PlaylistSidebarProps {
  playlist: PlaylistSummary;
  currentIndex: number;
  onSelect: (index: number) => void;
  onPrevious: () => void;
  onNext: () => void;
}

/**
 * The course list beside the player.
 *
 * Memoised because the shell re-renders on every heartbeat to update the live
 * watch counters, and re-rendering twenty rows five times a minute for numbers
 * that only change when a video changes is wasted work.
 */
export const PlaylistSidebar = memo(function PlaylistSidebar({
  playlist,
  currentIndex,
  onSelect,
  onPrevious,
  onNext,
}: PlaylistSidebarProps) {
  const { items, title, analytics } = playlist;
  const done = analytics.videoCount > 0 ? analytics.completed / analytics.videoCount : 0;

  return (
    <aside className="panel flex max-h-[30rem] flex-col overflow-hidden lg:max-h-[36rem]">
      <header className="border-b border-rule p-4">
        <h2 className="truncate text-sm font-semibold" title={title}>
          {title || 'Playlist'}
        </h2>
        <p className="mt-0.5 text-xs text-dim">
          {currentIndex >= 0 ? `${currentIndex + 1} of ${items.length}` : `${items.length} videos`}
          {analytics.completed > 0 && ` · ${analytics.completed} done`}
        </p>

        <div className="track mt-2.5 h-1">
          <span className="track-run animate-wipe" style={{ left: 0, width: `${done * 100}%` }} />
        </div>

        <div className="mt-3 flex gap-2">
          <button
            type="button"
            onClick={onPrevious}
            disabled={currentIndex <= 0}
            className="btn btn-quiet flex-1 px-2 py-1.5 text-xs"
          >
            <Icon name="chevronLeft" size={13} />
            Prev
          </button>
          <button
            type="button"
            onClick={onNext}
            disabled={currentIndex < 0 || currentIndex >= items.length - 1}
            className="btn btn-quiet flex-1 px-2 py-1.5 text-xs"
          >
            Next
            <Icon name="chevronRight" size={13} />
          </button>
        </div>
      </header>

      <ol className="min-h-0 flex-1 overflow-y-auto p-1.5">
        {items.map((item) => (
          <Row
            key={`${item.position}-${item.youtubeVideoId}`}
            item={item}
            isCurrent={item.position === currentIndex}
            onSelect={onSelect}
          />
        ))}
      </ol>
    </aside>
  );
});

function Row({
  item,
  isCurrent,
  onSelect,
}: {
  item: PlaylistItem;
  isCurrent: boolean;
  onSelect: (index: number) => void;
}) {
  return (
    <li>
      <button
        type="button"
        onClick={() => onSelect(item.position)}
        aria-current={isCurrent ? 'true' : undefined}
        className={`flex w-full items-start gap-2.5 rounded-xl px-2.5 py-2 text-left transition-colors ${
          isCurrent ? 'bg-panel-2' : 'hover:bg-panel-2/60'
        }`}
      >
        <StatusMark item={item} isCurrent={isCurrent} />

        <span className="min-w-0 flex-1">
          <span
            className={`block truncate text-[0.8rem] leading-snug ${
              isCurrent ? 'font-semibold text-text' : 'font-medium'
            }`}
            title={item.title}
          >
            {item.position + 1}. {item.title || item.youtubeVideoId}
          </span>

          <span className="mt-0.5 block text-[0.7rem] text-dim">
            {item.status === 'NOT_STARTED' ? 'Not started' : <Progress item={item} />}
          </span>

          {item.durationSeconds > 0 && item.status !== 'NOT_STARTED' && (
            <span className="mt-1.5 block">
              <Ratio
                watchedSeconds={item.watchedSeconds}
                skippedSeconds={item.skippedSeconds}
                totalSeconds={item.durationSeconds}
                height="h-1"
              />
            </span>
          )}
        </span>
      </button>
    </li>
  );
}

function Progress({ item }: { item: PlaylistItem }) {
  // Durations are unknown until a video has been played at least once on the
  // keyless path, so show what we genuinely know rather than a fake total.
  if (item.durationSeconds <= 0) {
    return <>{formatDuration(item.watchedSeconds)} watched</>;
  }
  return (
    <>
      {formatDuration(item.watchedSeconds)} / {formatDuration(item.durationSeconds)} ·{' '}
      {formatPercentage(item.watchedPercentage)}
    </>
  );
}

function StatusMark({ item, isCurrent }: { item: PlaylistItem; isCurrent: boolean }) {
  // Every mark occupies the same 20px box so the titles beside them stay on one
  // left edge regardless of status.
  const box = 'mt-0.5 grid h-5 w-5 shrink-0 place-items-center rounded-full';

  if (isCurrent) {
    return (
      <span className={`${box} bg-signal text-[#16120a]`} aria-label="Now playing">
        <Icon name="play" size={9} />
      </span>
    );
  }
  if (item.status === 'COMPLETED') {
    return (
      <span
        className={box}
        style={{
          background: 'color-mix(in oklab, var(--color-study) 20%, transparent)',
          color: 'var(--color-study)',
        }}
        aria-label="Completed"
      >
        <Icon name="check" size={11} strokeWidth={2.4} />
      </span>
    );
  }
  if (item.status === 'IN_PROGRESS') {
    return (
      <span className={box} aria-label="In progress">
        <span className="h-2 w-2 rounded-full border-2 border-signal" />
      </span>
    );
  }
  return (
    <span className={box} aria-label="Not started">
      <span className="h-2 w-2 rounded-full border border-rule" />
    </span>
  );
}
