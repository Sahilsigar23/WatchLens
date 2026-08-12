'use client';

import { memo } from 'react';

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
 * The playlist list beside the player.
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
  const { items, title } = playlist;

  return (
    <aside className="card flex max-h-[26rem] flex-col overflow-hidden lg:max-h-[34rem]">
      <header className="border-b border-line px-4 py-3">
        <h2 className="truncate text-sm font-semibold" title={title}>
          {title || 'Playlist'}
        </h2>
        <p className="mt-0.5 text-xs text-muted">
          {currentIndex >= 0 ? `${currentIndex + 1} of ${items.length}` : `${items.length} videos`}
        </p>

        <div className="mt-2 flex gap-2">
          <button
            type="button"
            onClick={onPrevious}
            disabled={currentIndex <= 0}
            className="flex-1 rounded-lg border border-line px-2 py-1.5 text-xs transition-colors hover:border-brand disabled:opacity-40 disabled:hover:border-line"
          >
            ← Previous
          </button>
          <button
            type="button"
            onClick={onNext}
            disabled={currentIndex < 0 || currentIndex >= items.length - 1}
            className="flex-1 rounded-lg border border-line px-2 py-1.5 text-xs transition-colors hover:border-brand disabled:opacity-40 disabled:hover:border-line"
          >
            Next →
          </button>
        </div>
      </header>

      <ol className="min-h-0 flex-1 divide-y divide-line overflow-y-auto">
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
        className={`flex w-full items-start gap-2.5 px-3 py-2.5 text-left transition-colors hover:bg-canvas ${
          isCurrent ? 'bg-canvas' : ''
        }`}
      >
        <StatusMark item={item} isCurrent={isCurrent} />

        <span className="min-w-0 flex-1">
          <span
            className={`block truncate text-sm ${isCurrent ? 'font-semibold' : 'font-medium'}`}
            title={item.title}
          >
            {item.position + 1}. {item.title || item.youtubeVideoId}
          </span>

          <span className="mt-0.5 block text-xs text-muted">
            {item.status === 'NOT_STARTED' ? 'Not started' : <Progress item={item} />}
          </span>

          {/* Coverage bar: watched, then skipped, against the full duration. */}
          {item.durationSeconds > 0 && item.status !== 'NOT_STARTED' && (
            <span className="mt-1 flex h-1 w-full overflow-hidden rounded-full bg-line">
              <span
                style={{
                  width: `${(item.watchedSeconds / item.durationSeconds) * 100}%`,
                  background: 'var(--color-brand)',
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
    return <>Actual: {formatDuration(item.watchedSeconds)}</>;
  }
  return (
    <>
      Actual: {formatDuration(item.watchedSeconds)} / {formatDuration(item.durationSeconds)} —{' '}
      {formatPercentage(item.watchedPercentage)}
    </>
  );
}

function StatusMark({ item, isCurrent }: { item: PlaylistItem; isCurrent: boolean }) {
  if (isCurrent) {
    return (
      <span className="mt-0.5 shrink-0 text-sm leading-5 text-brand" aria-label="Now playing">
        ▶
      </span>
    );
  }
  if (item.status === 'COMPLETED') {
    return (
      <span className="mt-0.5 shrink-0 text-sm leading-5 text-study" aria-label="Completed">
        ✓
      </span>
    );
  }
  if (item.status === 'IN_PROGRESS') {
    return (
      <span className="mt-0.5 shrink-0 text-sm leading-5 text-fun" aria-label="In progress">
        ◐
      </span>
    );
  }
  return (
    <span className="mt-0.5 shrink-0 text-sm leading-5 text-muted" aria-label="Not started">
      ○
    </span>
  );
}
