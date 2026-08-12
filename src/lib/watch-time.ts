import { clampInterval, mergeIntervals, rawLength, unionLength } from './intervals';
import type { EventType, Interval, WatchStats } from './types';

/**
 * The watch-time algorithm.
 *
 * The naive `lastPosition - firstPosition` is wrong: open a 60 min video, watch
 * 2 min, drag the scrubber to 55:00, watch to the end, and it reports 60 min.
 * Instead we replay the raw event log as a state machine and emit the spans of
 * the video timeline that the player genuinely ran through. A seek closes the
 * current span at the position jumped *away from* and opens a new one where it
 * landed, so the jumped-over region is never inside any span.
 *
 * Pure and side-effect free — no database, no browser. See watch-time.test.ts.
 */

/** One row from `watch_events`, in the shape the algorithm needs. */
export interface RawEvent {
  type: EventType;
  videoTime: number;
  previousVideoTime: number | null;
  /** Wall-clock milliseconds since epoch. */
  timestamp: number;
}

/**
 * Should audio that keeps playing while the user is on another tab count as
 * watched time? Default no — this is a *study* tracker, and time spent reading
 * something else is not study time. Flip to `true` to count it.
 */
export const COUNT_HIDDEN_TAB_TIME = false;

/**
 * Fastest playback YouTube offers is 2x. Anything beyond this (plus slack for
 * clock skew) means a span grew faster than wall-clock physics allows, which
 * can only happen if a SEEK went missing — a dropped batch, a browser that
 * killed the tab before the flush. The span is clamped to what was physically
 * possible rather than trusted, so a lost seek can never inflate watch time.
 */
const MAX_PLAYBACK_RATE = 2.5;
const CLOCK_SLACK_SECONDS = 3;

/** How close to the duration counts as "reached the end". */
const END_TOLERANCE_SECONDS = 2;

interface BuildResult {
  /** Spans in play order, rewatches included. Not yet merged or clamped. */
  intervals: Interval[];
  reachedEnd: boolean;
}

/**
 * Replays one session's events into watched spans.
 *
 * Events must be sorted by (timestamp, id) — the id tiebreak matters because a
 * batch of events can share a millisecond.
 */
export function buildIntervals(events: RawEvent[]): BuildResult {
  const intervals: Interval[] = [];

  let playing = false;
  let visible = true;
  /** Video position where the current span opened, or null if none is open. */
  let anchor: number | null = null;
  /** Wall-clock ms when the current span opened — used for the physics guard. */
  let anchorWallMs = 0;
  let reachedEnd = false;

  const counting = () => playing && (visible || COUNT_HIDDEN_TAB_TIME);

  /** Closes the open span at `videoTime`, discarding implausible ones. */
  const closeRun = (videoTime: number, wallMs: number) => {
    if (anchor === null) return;
    const start = anchor;
    anchor = null;

    if (!Number.isFinite(videoTime) || videoTime <= start) return;

    // Wall-clock physics: a span can never be longer than the real time that
    // elapsed while it was open, scaled by the fastest possible playback rate.
    const elapsed = Math.max(0, (wallMs - anchorWallMs) / 1000);
    const maxPlausible = elapsed * MAX_PLAYBACK_RATE + CLOCK_SLACK_SECONDS;
    const end = Math.min(videoTime, start + maxPlausible);

    if (end > start) intervals.push({ start, end });
  };

  /** Opens a span at `videoTime` if we should currently be counting. */
  const openRun = (videoTime: number, wallMs: number) => {
    if (!counting() || anchor !== null) return;
    if (!Number.isFinite(videoTime)) return;
    anchor = videoTime;
    anchorWallMs = wallMs;
  };

  for (const event of events) {
    const t = event.videoTime;
    const wall = event.timestamp;

    switch (event.type) {
      case 'PLAY':
        playing = true;
        openRun(t, wall);
        break;

      case 'PAUSE':
        closeRun(t, wall);
        playing = false;
        break;

      // A heartbeat closes and immediately reopens the span at the same point.
      // The totals are unchanged, but if the tab dies before the next event the
      // already-closed part survives instead of being lost.
      case 'HEARTBEAT':
        if (counting()) {
          closeRun(t, wall);
          openRun(t, wall);
        }
        break;

      // The whole point of the exercise. The span ends where the user jumped
      // *from*; the region between there and where they landed is never
      // covered by any span, so it lands in `skippedSeconds`.
      case 'SEEK':
        closeRun(event.previousVideoTime ?? t, wall);
        openRun(t, wall);
        break;

      case 'END':
        closeRun(t, wall);
        playing = false;
        reachedEnd = true;
        break;

      case 'TAB_HIDDEN':
        closeRun(t, wall);
        visible = false;
        break;

      case 'TAB_VISIBLE':
        visible = true;
        openRun(t, wall);
        break;

      case 'VIDEO_CHANGE':
      case 'SESSION_END':
        closeRun(t, wall);
        playing = false;
        break;
    }
  }

  // A span still open at the end means the tab was closed or the browser was
  // killed. Close it at the last position we heard about — the heartbeat bounds
  // how much this can cost us.
  if (anchor !== null && events.length > 0) {
    const last = events[events.length - 1];
    closeRun(last.videoTime, last.timestamp);
  }

  return { intervals, reachedEnd };
}

/**
 * Turns raw spans into the numbers the dashboard shows.
 *
 * `skipped` is the un-watched part of the region the user actually reached, not
 * `duration - watched`. Abandoning a 60 min video after 10 honest minutes is
 * not "50 minutes skipped" — it is 10 watched, 0 skipped, 50 never opened.
 */
export function computeWatchStats(
  rawIntervals: Interval[],
  durationSeconds: number,
  reachedEndEvent = false,
): WatchStats {
  const clamped = rawIntervals
    .map((i) => clampInterval(i, durationSeconds))
    .filter((i): i is Interval => i !== null);

  const merged = mergeIntervals(clamped);
  const watchedSeconds = unionLength(merged);
  const playbackSeconds = rawLength(clamped);
  const reachedSeconds = merged.length > 0 ? merged[merged.length - 1].end : 0;

  const skippedSeconds = Math.max(0, reachedSeconds - watchedSeconds);
  const remainingSeconds =
    durationSeconds > 0 ? Math.max(0, durationSeconds - reachedSeconds) : 0;

  const reachedEnd =
    reachedEndEvent ||
    (durationSeconds > 0 && reachedSeconds >= durationSeconds - END_TOLERANCE_SECONDS);

  return {
    watchedSeconds,
    playbackSeconds,
    skippedSeconds,
    reachedSeconds,
    remainingSeconds,
    watchedPercentage: durationSeconds > 0 ? watchedSeconds / durationSeconds : 0,
    reachedEnd,
    intervals: merged,
  };
}

/**
 * Full pipeline for one video: every session's events, keyed by session id.
 *
 * Sessions are replayed independently — state must not leak across a page
 * refresh — but their spans are merged at the end, so watching 0-10 today and
 * 5-20 tomorrow is 20 unique seconds of video, not 25.
 */
export function statsForVideo(
  eventsBySession: Map<number, RawEvent[]>,
  durationSeconds: number,
): WatchStats {
  const all: Interval[] = [];
  let reachedEnd = false;

  for (const events of eventsBySession.values()) {
    const result = buildIntervals(events);
    all.push(...result.intervals);
    reachedEnd = reachedEnd || result.reachedEnd;
  }

  return computeWatchStats(all, durationSeconds, reachedEnd);
}
