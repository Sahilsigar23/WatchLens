/** Shared types for both the browser tracker and the server-side analytics. */

export const EVENT_TYPES = [
  'PLAY',
  'PAUSE',
  'SEEK',
  'END',
  'TAB_VISIBLE',
  'TAB_HIDDEN',
  'VIDEO_CHANGE',
  /**
   * Emitted every few seconds while playing. Not in the original spec, but
   * without it a tab that is closed or crashes mid-play leaves an unterminated
   * PLAY and the whole run has to be discarded. A heartbeat bounds the loss to
   * one interval (HEARTBEAT_MS).
   */
  'HEARTBEAT',
  /** Best-effort final event, sent via navigator.sendBeacon on page unload. */
  'SESSION_END',
] as const;

export type EventType = (typeof EVENT_TYPES)[number];

export type Category = 'STUDY' | 'ENTERTAINMENT' | 'OTHER';

/** An event as it travels from the browser to POST /api/events. */
export interface TrackedEvent {
  /** Browser-generated id; makes a retried batch idempotent. */
  clientEventId: string;
  sessionId: number;
  type: EventType;
  /** Player position in seconds when the event fired. */
  videoTime: number;
  /** SEEK only: the position jumped away from. */
  previousVideoTime?: number;
  /** Wall-clock ms since epoch, from the browser. */
  timestamp: number;
}

/** A half-open `[start, end)` span of the video timeline that was really played. */
export interface Interval {
  start: number;
  end: number;
}

/** Output of the watch-time algorithm for one video. */
export interface WatchStats {
  /** Union of watched intervals — a rewatched second counts once. */
  watchedSeconds: number;
  /** Total seconds the player actually ran, counting rewatches. */
  playbackSeconds: number;
  /** Gaps inside the region the user reached, i.e. genuinely fast-forwarded. */
  skippedSeconds: number;
  /** Furthest position reached in the video. */
  reachedSeconds: number;
  /** Tail of the video never opened at all (duration - reached). */
  remainingSeconds: number;
  /** watchedSeconds / duration, 0..1. */
  watchedPercentage: number;
  /** Did an END event fire, or did playback reach ~the last second? */
  reachedEnd: boolean;
  /** The merged intervals themselves, handy for debugging and timelines. */
  intervals: Interval[];
}

export interface VideoMeta {
  youtubeVideoId: string;
  title: string;
  channelName: string;
  durationSeconds: number;
}

export interface HistoryRow {
  youtubeVideoId: string;
  title: string;
  channelName: string;
  durationSeconds: number;
  category: Category;
  watchedSeconds: number;
  skippedSeconds: number;
  watchedPercentage: number;
  reachedEnd: boolean;
  lastWatchedAt: string;
  sessionCount: number;
}

/** Where a video stands, for the playlist sidebar's ✓ / ▶ / ○ markers. */
export type ItemStatus = 'COMPLETED' | 'IN_PROGRESS' | 'NOT_STARTED';

export interface PlaylistItem {
  position: number;
  youtubeVideoId: string;
  title: string;
  channelName: string;
  /** 0 when the duration is not known yet — see the note in playlist-meta.ts. */
  durationSeconds: number;
  watchedSeconds: number;
  skippedSeconds: number;
  watchedPercentage: number;
  reachedEnd: boolean;
  status: ItemStatus;
}

export interface PlaylistAnalytics {
  videoCount: number;
  completed: number;
  inProgress: number;
  notStarted: number;
  /** Sum of per-video unique coverage. */
  watchedSeconds: number;
  /** Sum of durations, for videos whose duration is known. */
  totalDurationSeconds: number;
  skippedSeconds: number;
  /** watchedSeconds / totalDurationSeconds, 0..1. */
  progress: number;
  /** True when at least one duration is still unknown, so totals are partial. */
  durationsIncomplete: boolean;
}

export interface PlaylistSummary {
  youtubePlaylistId: string;
  title: string;
  items: PlaylistItem[];
  analytics: PlaylistAnalytics;
  /** Index the user was last watching in this playlist, if they have history. */
  resumeIndex: number | null;
}

export interface DayStats {
  /** YYYY-MM-DD in the user's timezone. */
  date: string;
  totalYoutubeSeconds: number;
  watchedSeconds: number;
  skippedSeconds: number;
  studySeconds: number;
  entertainmentSeconds: number;
  otherSeconds: number;
  videoCount: number;
  studyVideoCount: number;
  completedStudyVideoCount: number;
  averageWatchedPercentage: number;
}
