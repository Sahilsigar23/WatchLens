import { query } from './db';
import { mergeIntervals, unionLength } from './intervals';
import type { Category, DayStats, HistoryRow, Interval } from './types';
import { buildIntervals, computeWatchStats, type RawEvent } from './watch-time';

/**
 * Analytics is deliberately separated from playback: nothing here runs in the
 * browser, and the player never waits on it. Everything is derived from the raw
 * `watch_events` log at read time, so improving the algorithm improves history
 * retroactively with no migration.
 *
 * Sessions are small (tens of events) and a week is tens of sessions, so
 * replaying them per request is cheap. If a user's history ever outgrows that,
 * the fix is a materialised `session_stats` table — the shape of this module
 * would not change.
 */

/** A video counts as "completed" once this much of it has been watched. */
export const COMPLETION_THRESHOLD = 0.9;

export interface SessionRecord {
  sessionId: number;
  videoId: number;
  youtubeVideoId: string;
  title: string;
  channelName: string;
  durationSeconds: number;
  category: Category;
  startedAt: Date;
  endedAt: Date | null;
  /** Wall-clock seconds the session was open on our site. */
  elapsedSeconds: number;
  intervals: Interval[];
  reachedEnd: boolean;
}

interface SessionRow {
  session_id: string;
  video_id: string;
  youtube_video_id: string;
  title: string;
  channel_name: string;
  duration_seconds: number;
  category: string;
  started_at: Date;
  ended_at: Date | null;
}

interface EventRow {
  session_id: string;
  event_type: string;
  video_time: string | number;
  previous_video_time: string | number | null;
  timestamp: Date;
}

/**
 * Loads every session in `[since, until)` together with its replayed intervals.
 * Two queries total, regardless of how many sessions come back.
 */
/** The session columns every loader selects, so they share one row shape. */
const SESSION_COLUMNS = `s.id            AS session_id,
            v.id            AS video_id,
            v.youtube_video_id,
            v.title,
            v.channel_name,
            v.duration_seconds,
            v.category,
            s.started_at,
            s.ended_at`;

export async function loadSessions(
  userId: number,
  since: Date,
  until: Date,
): Promise<SessionRecord[]> {
  return attachEvents(
    userId,
    await query<SessionRow>(
      `SELECT ${SESSION_COLUMNS}
         FROM watch_sessions s
         JOIN videos v ON v.id = s.video_id
        WHERE s.user_id = $1
          AND s.started_at >= $2
          AND s.started_at < $3
        ORDER BY s.started_at ASC`,
      [userId, since, until],
    ),
  );
}

/**
 * Sessions for a specific set of videos, all time.
 *
 * The playlist panel needs exactly this: replaying a user's entire history to
 * show progress on twenty videos would get slower every week they use the app.
 */
export async function loadSessionsForVideos(
  userId: number,
  youtubeVideoIds: string[],
): Promise<SessionRecord[]> {
  if (youtubeVideoIds.length === 0) return [];

  return attachEvents(
    userId,
    await query<SessionRow>(
      `SELECT ${SESSION_COLUMNS}
         FROM watch_sessions s
         JOIN videos v ON v.id = s.video_id
        WHERE s.user_id = $1
          AND v.youtube_video_id = ANY($2::text[])
        ORDER BY s.started_at ASC`,
      [userId, youtubeVideoIds],
    ),
  );
}

/**
 * Loads each session's events and replays them into watched spans.
 *
 * The event query re-states `user_id` even though `sessionIds` came from an
 * already user-filtered query. It is redundant by construction and deliberately
 * so: it means no future caller can reach this with session ids it did not
 * own-check, and the redundant filter costs nothing on an indexed column.
 */
async function attachEvents(
  userId: number,
  sessionRows: SessionRow[],
): Promise<SessionRecord[]> {
  if (sessionRows.length === 0) return [];

  const sessionIds = sessionRows.map((r) => Number(r.session_id));
  const eventRows = await query<EventRow>(
    `SELECT session_id, event_type, video_time, previous_video_time, timestamp
       FROM watch_events
      WHERE session_id = ANY($1::bigint[]) AND user_id = $2
      ORDER BY timestamp ASC, id ASC`,
    [sessionIds, userId],
  );

  const eventsBySession = new Map<number, RawEvent[]>();
  for (const row of eventRows) {
    const id = Number(row.session_id);
    const list = eventsBySession.get(id) ?? [];
    list.push({
      type: row.event_type as RawEvent['type'],
      videoTime: Number(row.video_time),
      previousVideoTime:
        row.previous_video_time === null ? null : Number(row.previous_video_time),
      timestamp: row.timestamp.getTime(),
    });
    eventsBySession.set(id, list);
  }

  return sessionRows.map((row) => {
    const sessionId = Number(row.session_id);
    const events = eventsBySession.get(sessionId) ?? [];
    const { intervals, reachedEnd } = buildIntervals(events);

    // Prefer the recorded end; fall back to the last event so a session whose
    // tab was killed still contributes a sane wall-clock figure.
    const lastEventAt = events.length > 0 ? events[events.length - 1].timestamp : null;
    const endMs = row.ended_at?.getTime() ?? lastEventAt ?? row.started_at.getTime();

    return {
      sessionId,
      videoId: Number(row.video_id),
      youtubeVideoId: row.youtube_video_id,
      title: row.title,
      channelName: row.channel_name,
      durationSeconds: Number(row.duration_seconds),
      category: row.category as Category,
      startedAt: row.started_at,
      endedAt: row.ended_at,
      elapsedSeconds: Math.max(0, (endMs - row.started_at.getTime()) / 1000),
      intervals,
      reachedEnd,
    };
  });
}

/** `YYYY-MM-DD` for `date` as seen in `timeZone`. `en-CA` formats ISO-style. */
export function dateKeyInZone(date: Date, timeZone: string): string {
  try {
    return new Intl.DateTimeFormat('en-CA', {
      timeZone,
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
    }).format(date);
  } catch {
    // An unknown IANA zone from a spoofed client must not 500 the dashboard.
    return new Intl.DateTimeFormat('en-CA', {
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
    }).format(date);
  }
}

/**
 * Rolls sessions up per local day.
 *
 * Intervals are merged per (day, video) before counting, so rewatching the same
 * five minutes three times in one afternoon is five minutes of watch time, not
 * fifteen. `skipped` stays per-video for the same reason.
 */
export function summarizeByDay(
  sessions: SessionRecord[],
  dates: string[],
  timeZone: string,
): DayStats[] {
  interface Bucket {
    totalYoutubeSeconds: number;
    byVideo: Map<
      number,
      { durationSeconds: number; category: Category; intervals: Interval[]; reachedEnd: boolean }
    >;
  }

  const buckets = new Map<string, Bucket>();
  for (const date of dates) {
    buckets.set(date, { totalYoutubeSeconds: 0, byVideo: new Map() });
  }

  for (const session of sessions) {
    const key = dateKeyInZone(session.startedAt, timeZone);
    const bucket = buckets.get(key);
    if (!bucket) continue; // outside the requested window

    bucket.totalYoutubeSeconds += session.elapsedSeconds;

    const existing = bucket.byVideo.get(session.videoId);
    if (existing) {
      existing.intervals.push(...session.intervals);
      existing.reachedEnd = existing.reachedEnd || session.reachedEnd;
    } else {
      bucket.byVideo.set(session.videoId, {
        durationSeconds: session.durationSeconds,
        category: session.category,
        intervals: [...session.intervals],
        reachedEnd: session.reachedEnd,
      });
    }
  }

  return dates.map((date) => {
    const bucket = buckets.get(date)!;

    let watchedSeconds = 0;
    let skippedSeconds = 0;
    let studySeconds = 0;
    let entertainmentSeconds = 0;
    let otherSeconds = 0;
    let studyVideoCount = 0;
    let completedStudyVideoCount = 0;
    let percentageSum = 0;

    for (const video of bucket.byVideo.values()) {
      const stats = computeWatchStats(video.intervals, video.durationSeconds, video.reachedEnd);

      watchedSeconds += stats.watchedSeconds;
      skippedSeconds += stats.skippedSeconds;
      percentageSum += stats.watchedPercentage;

      if (video.category === 'STUDY') {
        studySeconds += stats.watchedSeconds;
        studyVideoCount += 1;
        // Watched-through, not merely played-through: reaching the end by
        // fast-forwarding is exactly what this app refuses to call completion.
        if (stats.watchedPercentage >= COMPLETION_THRESHOLD) {
          completedStudyVideoCount += 1;
        }
      } else if (video.category === 'ENTERTAINMENT') {
        entertainmentSeconds += stats.watchedSeconds;
      } else {
        otherSeconds += stats.watchedSeconds;
      }
    }

    const videoCount = bucket.byVideo.size;

    return {
      date,
      totalYoutubeSeconds: Math.round(bucket.totalYoutubeSeconds),
      watchedSeconds: Math.round(watchedSeconds),
      skippedSeconds: Math.round(skippedSeconds),
      studySeconds: Math.round(studySeconds),
      entertainmentSeconds: Math.round(entertainmentSeconds),
      otherSeconds: Math.round(otherSeconds),
      videoCount,
      studyVideoCount,
      completedStudyVideoCount,
      averageWatchedPercentage: videoCount > 0 ? percentageSum / videoCount : 0,
    } satisfies DayStats;
  });
}

/**
 * All-time per-video history, newest first.
 *
 * Intervals from every session for a video are merged before counting, so a
 * video watched across three sittings reports unique coverage rather than the
 * sum of three overlapping attempts.
 */
export async function loadHistory(userId: number, limit = 100): Promise<HistoryRow[]> {
  const veryOld = new Date(0);
  const future = new Date(Date.now() + 86_400_000);
  const sessions = await loadSessions(userId, veryOld, future);

  interface Aggregate {
    youtubeVideoId: string;
    title: string;
    channelName: string;
    durationSeconds: number;
    category: Category;
    intervals: Interval[];
    reachedEnd: boolean;
    lastWatchedAt: Date;
    sessionCount: number;
  }

  const byVideo = new Map<number, Aggregate>();

  for (const session of sessions) {
    const existing = byVideo.get(session.videoId);
    if (existing) {
      existing.intervals.push(...session.intervals);
      existing.reachedEnd = existing.reachedEnd || session.reachedEnd;
      existing.sessionCount += 1;
      if (session.startedAt > existing.lastWatchedAt) existing.lastWatchedAt = session.startedAt;
    } else {
      byVideo.set(session.videoId, {
        youtubeVideoId: session.youtubeVideoId,
        title: session.title,
        channelName: session.channelName,
        durationSeconds: session.durationSeconds,
        category: session.category,
        intervals: [...session.intervals],
        reachedEnd: session.reachedEnd,
        lastWatchedAt: session.startedAt,
        sessionCount: 1,
      });
    }
  }

  return [...byVideo.values()]
    .map((video) => {
      const stats = computeWatchStats(video.intervals, video.durationSeconds, video.reachedEnd);
      return {
        youtubeVideoId: video.youtubeVideoId,
        title: video.title,
        channelName: video.channelName,
        durationSeconds: video.durationSeconds,
        category: video.category,
        watchedSeconds: Math.round(stats.watchedSeconds),
        skippedSeconds: Math.round(stats.skippedSeconds),
        watchedPercentage: stats.watchedPercentage,
        reachedEnd: stats.reachedEnd,
        lastWatchedAt: video.lastWatchedAt.toISOString(),
        sessionCount: video.sessionCount,
        lastPositionSeconds: Math.floor(stats.reachedSeconds),
      } satisfies HistoryRow;
    })
    .sort((a, b) => b.lastWatchedAt.localeCompare(a.lastWatchedAt))
    .slice(0, limit);
}

/**
 * Consecutive days ending today (or yesterday) on which this user watched
 * something.
 *
 * Counted straight from session dates in SQL rather than by replaying events:
 * a streak only asks *whether* a day had activity, and replaying two months of
 * event logs to answer that would make the Weekly page pay for a decoration.
 *
 * Yesterday counts as the anchor too, so a streak is not reported broken during
 * a day the user simply has not watched anything yet.
 */
export async function currentStreak(userId: number, timeZone: string): Promise<number> {
  const rows = await query<{ day: string }>(
    `SELECT DISTINCT to_char((s.started_at AT TIME ZONE $2)::date, 'YYYY-MM-DD') AS day
       FROM watch_sessions s
      WHERE s.user_id = $1
        AND s.started_at > now() - interval '120 days'
      ORDER BY day DESC
      LIMIT 120`,
    [userId, timeZone],
  );
  if (rows.length === 0) return 0;

  const active = new Set(rows.map((r) => r.day));
  const today = todayKey(timeZone);
  const yesterday = shiftDay(today, -1);

  let cursor = active.has(today) ? today : active.has(yesterday) ? yesterday : null;
  if (cursor === null) return 0;

  let streak = 0;
  while (active.has(cursor)) {
    streak += 1;
    cursor = shiftDay(cursor, -1);
  }
  return streak;
}

function todayKey(timeZone: string): string {
  return dateKeyInZone(new Date(), timeZone);
}

/** Day arithmetic on a UTC-anchored date, so DST cannot shift the result. */
function shiftDay(key: string, delta: number): string {
  const [y, m, d] = key.split('-').map(Number);
  const date = new Date(Date.UTC(y, m - 1, d));
  date.setUTCDate(date.getUTCDate() + delta);
  return date.toISOString().slice(0, 10);
}

/**
 * Watched seconds bucketed into the 24 hours of a local day.
 *
 * The watch-time algorithm works on the *video* timeline, which says nothing
 * about when in the day something was watched. Each session's watched total is
 * therefore spread across the wall-clock hours it actually spanned, in
 * proportion to how much of the session fell in each. That keeps every bar
 * honest against the day's total — the buckets always sum to the same number
 * `summarizeByDay` reports — without pretending to a precision the event log
 * does not carry.
 */
export function hourlyWatchedSeconds(
  sessions: SessionRecord[],
  date: string,
  timeZone: string,
): number[] {
  const hours = new Array<number>(24).fill(0);

  for (const session of sessions) {
    if (dateKeyInZone(session.startedAt, timeZone) !== date) continue;

    const stats = computeWatchStats(session.intervals, session.durationSeconds);
    if (stats.watchedSeconds <= 0) continue;

    const startMs = session.startedAt.getTime();
    const endMs = startMs + Math.max(1000, session.elapsedSeconds * 1000);
    const spanMs = endMs - startMs;

    // Walk the wall-clock span hour by hour, crediting each with its share.
    for (let cursor = startMs; cursor < endMs; ) {
      const hour = Number(
        new Intl.DateTimeFormat('en-GB', { timeZone, hour: '2-digit', hour12: false }).format(
          new Date(cursor),
        ),
      );
      const nextHour = new Date(cursor);
      nextHour.setMinutes(60, 0, 0);
      const sliceEnd = Math.min(endMs, nextHour.getTime());

      const share = (sliceEnd - cursor) / spanMs;
      if (hour >= 0 && hour < 24) hours[hour] += stats.watchedSeconds * share;

      cursor = sliceEnd;
    }
  }

  return hours.map((value) => Math.round(value));
}

/** Everything known about one video's viewing, before a duration is applied. */
export interface VideoCoverage {
  intervals: Interval[];
  reachedEnd: boolean;
  /** Duration recorded when the video was last played; 0 if never played. */
  durationSeconds: number;
}

/**
 * Merged coverage per video, keyed by YouTube id.
 *
 * Returned without a duration applied so the caller can pass the best one it
 * has — the playlist panel often knows a duration from the Data API for a video
 * the user has never opened, which the database cannot know yet.
 */
export async function coverageForVideos(
  userId: number,
  youtubeVideoIds: string[],
): Promise<Map<string, VideoCoverage>> {
  const sessions = await loadSessionsForVideos(userId, youtubeVideoIds);
  const coverage = new Map<string, VideoCoverage>();

  for (const session of sessions) {
    const existing = coverage.get(session.youtubeVideoId);
    if (existing) {
      existing.intervals.push(...session.intervals);
      existing.reachedEnd = existing.reachedEnd || session.reachedEnd;
      if (session.durationSeconds > 0) existing.durationSeconds = session.durationSeconds;
    } else {
      coverage.set(session.youtubeVideoId, {
        intervals: [...session.intervals],
        reachedEnd: session.reachedEnd,
        durationSeconds: session.durationSeconds,
      });
    }
  }

  return coverage;
}

/**
 * How far into a video the user got, so a returning viewer can resume.
 * Uses the merged coverage rather than the last raw position — the point they
 * stopped *watching*, not the point they last scrubbed to.
 */
export async function lastPositionFor(
  userId: number,
  youtubeVideoId: string,
): Promise<number | null> {
  const rows = await query<{ session_id: string }>(
    `SELECT s.id AS session_id
       FROM watch_sessions s
       JOIN videos v ON v.id = s.video_id
      WHERE s.user_id = $1 AND v.youtube_video_id = $2
      ORDER BY s.started_at DESC
      LIMIT 5`,
    [userId, youtubeVideoId],
  );
  if (rows.length === 0) return null;

  const eventRows = await query<EventRow>(
    `SELECT session_id, event_type, video_time, previous_video_time, timestamp
       FROM watch_events
      WHERE session_id = ANY($1::bigint[]) AND user_id = $2
      ORDER BY timestamp ASC, id ASC`,
    [rows.map((r) => Number(r.session_id)), userId],
  );

  const bySession = new Map<number, RawEvent[]>();
  for (const row of eventRows) {
    const id = Number(row.session_id);
    const list = bySession.get(id) ?? [];
    list.push({
      type: row.event_type as RawEvent['type'],
      videoTime: Number(row.video_time),
      previousVideoTime: row.previous_video_time === null ? null : Number(row.previous_video_time),
      timestamp: row.timestamp.getTime(),
    });
    bySession.set(id, list);
  }

  const all: Interval[] = [];
  for (const events of bySession.values()) all.push(...buildIntervals(events).intervals);

  const merged = mergeIntervals(all);
  if (merged.length === 0 || unionLength(merged) < 30) return null;

  return Math.floor(merged[merged.length - 1].end);
}
