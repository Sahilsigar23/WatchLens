'use client';

import { memo } from 'react';

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
    <aside className="card flex max-h-[30rem] flex-col overflow-hidden lg:max-h-[36rem]">
      <header className="border-b border-line p-4">
        <h2 className="truncate text-sm font-semibold" title={title}>
          {title || 'Playlist'}
        </h2>
        <p className="mt-0.5 text-xs text-muted">
          {currentIndex >= 0 ? `${currentIndex + 1} of ${items.length}` : `${items.length} videos`}
          {analytics.completed > 0 && ` · ${analytics.completed} done`}
        </p>

        <div className="mt-2.5 h-1 w-full overflow-hidden rounded-full bg-canvas">
          <div
            className="animate-grow h-full rounded-full"
            style={{
              width: `${done * 100}%`,
              backgroundImage: 'linear-gradient(90deg, var(--color-brand), var(--color-accent))',
            }}
          />
        </div>

        <div className="mt-3 flex gap-2">
          <button
            type="button"
            onClick={onPrevious}
            disabled={currentIndex <= 0}
            className="btn btn-ghost flex-1 px-2 py-1.5 text-xs"
          >
            <Icon name="chevronLeft" size={13} />
            Prev
          </button>
          <button
            type="button"
            onClick={onNext}
            disabled={currentIndex < 0 || currentIndex >= items.length - 1}
            className="btn btn-ghost flex-1 px-2 py-1.5 text-xs"
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
          isCurrent ? 'bg-raised' : 'hover:bg-raised/60'
        }`}
      >
        <StatusMark item={item} isCurrent={isCurrent} />

        <span className="min-w-0 flex-1">
          <span
            className={`block truncate text-[0.8rem] leading-snug ${
              isCurrent ? 'font-semibold text-ink' : 'font-medium'
            }`}
            title={item.title}
          >
            {item.position + 1}. {item.title || item.youtubeVideoId}
          </span>

          <span className="mt-0.5 block text-[0.7rem] text-muted">
            {item.status === 'NOT_STARTED' ? 'Not started' : <Progress item={item} />}
          </span>

          {item.durationSeconds > 0 && item.status !== 'NOT_STARTED' && (
            <span className="mt-1 flex h-0.5 w-full overflow-hidden rounded-full bg-line">
              <span
                style={{
                  width: `${(item.watchedSeconds / item.durationSeconds) * 100}%`,
                  backgroundImage:
                    'linear-gradient(90deg, var(--color-brand), var(--color-accent))',
                }}
              />
              <span
                style={{
                  width: `${(item.skippedSeconds / item.durationSeconds) * 100}%`,
                  background: 'var(--color-skip)',
                }}
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
  if (isCurrent) {
    return (
      <span
        className="mt-0.5 grid h-5 w-5 shrink-0 place-items-center rounded-full text-white"
        style={{
          backgroundImage: 'linear-gradient(135deg, var(--color-brand), var(--color-accent))',
        }}
        aria-label="Now playing"
      >
        <Icon name="play" size={9} />
      </span>
    );
  }
  if (item.status === 'COMPLETED') {
    return (
      <span
        className="mt-0.5 grid h-5 w-5 shrink-0 place-items-center rounded-full"
        style={{ background: 'color-mix(in oklab, var(--color-study) 22%, transparent)', color: 'var(--color-study)' }}
        aria-label="Completed"
      >
        <Icon name="check" size={11} strokeWidth={2.4} />
      </span>
    );
  }
  if (item.status === 'IN_PROGRESS') {
    return (
      <span
        className="mt-1 h-2.5 w-2.5 shrink-0 rounded-full ring-2"
        style={{ background: 'var(--color-fun)', boxShadow: '0 0 0 3px color-mix(in oklab, var(--color-fun) 18%, transparent)' }}
        aria-label="In progress"
      />
    );
  }
  return (
    <span
      className="mt-1 h-2.5 w-2.5 shrink-0 rounded-full border border-line"
      aria-label="Not started"
    />
  );
}
