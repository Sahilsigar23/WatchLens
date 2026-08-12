import { COMPLETION_THRESHOLD, type VideoCoverage } from './analytics';
import type { ItemStatus, PlaylistAnalytics, PlaylistItem } from './types';
import { computeWatchStats } from './watch-time';

/**
 * Turns playlist metadata plus per-video coverage into the sidebar rows and the
 * aggregate panel.
 *
 * Pure, so the numbers on the playlist panel can be tested without a database,
 * a browser or a YouTube key. Every figure comes from the same
 * `computeWatchStats` the rest of the app uses — a playlist is only a grouping,
 * never a second way of measuring.
 */

export interface PlaylistMetaItem {
  youtubeVideoId: string;
  title: string;
  channelName: string;
  /** 0 when unknown; the coverage's recorded duration is used instead. */
  durationSeconds: number;
}

/**
 * Completion is decided by how much was actually watched, deliberately *not*
 * by whether the playhead reached the end.
 *
 * Fast-forwarding to the last second fires an END event and would otherwise
 * mark a video "completed" on 20% viewing — which is precisely the illusion
 * this whole application exists to dispel. A video genuinely watched through
 * clears the threshold on its own.
 */
export function statusFor(watchedSeconds: number, percentage: number): ItemStatus {
  if (watchedSeconds <= 0) return 'NOT_STARTED';
  if (percentage >= COMPLETION_THRESHOLD) return 'COMPLETED';
  return 'IN_PROGRESS';
}

export function summarizePlaylist(
  meta: PlaylistMetaItem[],
  coverage: Map<string, VideoCoverage>,
): { items: PlaylistItem[]; analytics: PlaylistAnalytics } {
  let watchedSeconds = 0;
  let skippedSeconds = 0;
  let totalDurationSeconds = 0;
  let durationsIncomplete = false;

  const items: PlaylistItem[] = meta.map((entry, position) => {
    const seen = coverage.get(entry.youtubeVideoId);

    // Prefer the metadata duration: the Data API knows it even for a video the
    // user has never opened, which the database cannot.
    const durationSeconds = entry.durationSeconds || seen?.durationSeconds || 0;
    if (durationSeconds === 0) durationsIncomplete = true;

    const stats = computeWatchStats(
      seen?.intervals ?? [],
      durationSeconds,
      seen?.reachedEnd ?? false,
    );

    watchedSeconds += stats.watchedSeconds;
    skippedSeconds += stats.skippedSeconds;
    totalDurationSeconds += durationSeconds;

    return {
      position,
      youtubeVideoId: entry.youtubeVideoId,
      title: entry.title,
      channelName: entry.channelName,
      durationSeconds,
      watchedSeconds: Math.round(stats.watchedSeconds),
      skippedSeconds: Math.round(stats.skippedSeconds),
      watchedPercentage: stats.watchedPercentage,
      reachedEnd: stats.reachedEnd,
      status: statusFor(stats.watchedSeconds, stats.watchedPercentage),
    };
  });

  const completed = items.filter((i) => i.status === 'COMPLETED').length;
  const inProgress = items.filter((i) => i.status === 'IN_PROGRESS').length;

  return {
    items,
    analytics: {
      videoCount: items.length,
      completed,
      inProgress,
      notStarted: items.length - completed - inProgress,
      watchedSeconds: Math.round(watchedSeconds),
      totalDurationSeconds: Math.round(totalDurationSeconds),
      skippedSeconds: Math.round(skippedSeconds),
      progress: totalDurationSeconds > 0 ? watchedSeconds / totalDurationSeconds : 0,
      durationsIncomplete,
    },
  };
}

/**
 * Where to drop the user back into a playlist.
 *
 * If they finished the video they were last on, hand them the next one rather
 * than reopening something they have already completed.
 */
export function resumeIndexFor(items: PlaylistItem[], lastIndex: number | null): number | null {
  if (lastIndex === null || lastIndex < 0 || lastIndex >= items.length) return null;
  if (items[lastIndex].status === 'COMPLETED' && lastIndex + 1 < items.length) return lastIndex + 1;
  return lastIndex;
}
