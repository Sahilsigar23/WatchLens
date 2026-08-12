import { coverageForVideos, lastPositionFor, loadHistory } from './analytics';
import { query, queryOne } from './db';
import { resumeIndexFor, summarizePlaylist, type PlaylistMetaItem } from './playlist-progress';
import type { HistoryRow, ResumePoint, UserPlaylistSummary } from './types';

/**
 * Account-scoped reads.
 *
 * Every function here takes a `userId` that came from the session cookie on the
 * server — never from a request body or query string — and every query filters
 * on it. There is no code path that returns another account's rows, which is
 * why the browser is never trusted to scope anything.
 *
 * The database is the source of truth. Browser storage holds only transient
 * player UI state (which video is on screen); everything below survives logout,
 * a cleared browser, and a different device.
 */

/** Cap on how many playlists to summarise in one response. */
const MAX_PLAYLISTS = 25;

/**
 * A playlist's contents as we already stored them.
 *
 * Used when neither the Data API nor the browser's player can supply the item
 * list — a slow player, a failed request, or a fresh device opening a playlist
 * the account has watched before. Because the ordering was persisted the first
 * time round, the playlist still opens with full progress instead of erroring.
 */
export async function loadStoredPlaylistItems(
  youtubePlaylistId: string,
): Promise<PlaylistMetaItem[]> {
  const rows = await query<{
    youtube_video_id: string;
    title: string;
    channel_name: string;
    duration_seconds: number;
  }>(
    `SELECT v.youtube_video_id, v.title, v.channel_name, v.duration_seconds
       FROM playlist_items pi
       JOIN playlists p ON p.id = pi.playlist_id
       JOIN videos v ON v.id = pi.video_id
      WHERE p.youtube_playlist_id = $1
      ORDER BY pi.position ASC`,
    [youtubePlaylistId],
  );

  return rows.map((row) => ({
    youtubeVideoId: row.youtube_video_id,
    title: row.title,
    channelName: row.channel_name,
    durationSeconds: Number(row.duration_seconds),
  }));
}

interface PlaylistRow {
  youtube_playlist_id: string;
  title: string;
  last_watched_at: Date;
  last_index: number | null;
}

interface PlaylistItemRow {
  youtube_playlist_id: string;
  position: number;
  youtube_video_id: string;
  title: string;
  channel_name: string;
  duration_seconds: number;
}

/**
 * Every playlist this user has watched from, newest first, with their progress.
 *
 * Three queries regardless of how many playlists come back: the playlists, all
 * of their items at once, then one coverage lookup across every video involved.
 */
export async function loadUserPlaylists(
  userId: number,
  limit = MAX_PLAYLISTS,
): Promise<UserPlaylistSummary[]> {
  const playlists = await query<PlaylistRow>(
    `SELECT p.youtube_playlist_id,
            p.title,
            max(s.started_at) AS last_watched_at,
            (array_agg(s.playlist_index ORDER BY s.started_at DESC)
               FILTER (WHERE s.playlist_index IS NOT NULL))[1] AS last_index
       FROM watch_sessions s
       JOIN playlists p ON p.id = s.playlist_id
      WHERE s.user_id = $1 AND s.playlist_id IS NOT NULL
      GROUP BY p.id, p.youtube_playlist_id, p.title
      ORDER BY max(s.started_at) DESC
      LIMIT $2`,
    [userId, limit],
  );

  if (playlists.length === 0) return [];

  const playlistIds = playlists.map((p) => p.youtube_playlist_id);
  const itemRows = await query<PlaylistItemRow>(
    `SELECT p.youtube_playlist_id, pi.position, v.youtube_video_id,
            v.title, v.channel_name, v.duration_seconds
       FROM playlist_items pi
       JOIN playlists p ON p.id = pi.playlist_id
       JOIN videos v ON v.id = pi.video_id
      WHERE p.youtube_playlist_id = ANY($1::text[])
      ORDER BY p.youtube_playlist_id, pi.position ASC`,
    [playlistIds],
  );

  const itemsByPlaylist = new Map<string, PlaylistMetaItem[]>();
  for (const row of itemRows) {
    const list = itemsByPlaylist.get(row.youtube_playlist_id) ?? [];
    list.push({
      youtubeVideoId: row.youtube_video_id,
      title: row.title,
      channelName: row.channel_name,
      durationSeconds: Number(row.duration_seconds),
    });
    itemsByPlaylist.set(row.youtube_playlist_id, list);
  }

  const allVideoIds = [...new Set(itemRows.map((r) => r.youtube_video_id))];
  const coverage = await coverageForVideos(userId, allVideoIds);

  return playlists.map((playlist) => {
    const meta = itemsByPlaylist.get(playlist.youtube_playlist_id) ?? [];
    const { items, analytics } = summarizePlaylist(meta, coverage);

    return {
      youtubePlaylistId: playlist.youtube_playlist_id,
      title: playlist.title,
      lastWatchedAt: playlist.last_watched_at.toISOString(),
      resumeIndex: resumeIndexFor(
        items,
        playlist.last_index === null ? null : Number(playlist.last_index),
      ),
      analytics,
    } satisfies UserPlaylistSummary;
  });
}

/**
 * The last thing this user watched, wherever they watched it.
 *
 * This is what lets a fresh browser or a second device pick up where the
 * account left off — the position comes from the event log, not localStorage.
 */
export async function loadResumePoint(userId: number): Promise<ResumePoint | null> {
  const row = await queryOne<{
    youtube_video_id: string;
    title: string;
    youtube_playlist_id: string | null;
    playlist_index: number | null;
    started_at: Date;
  }>(
    `SELECT v.youtube_video_id, v.title, p.youtube_playlist_id, s.playlist_index, s.started_at
       FROM watch_sessions s
       JOIN videos v ON v.id = s.video_id
       LEFT JOIN playlists p ON p.id = s.playlist_id
      WHERE s.user_id = $1
      ORDER BY s.started_at DESC
      LIMIT 1`,
    [userId],
  );
  if (!row) return null;

  const position = await lastPositionFor(userId, row.youtube_video_id);

  return {
    youtubeVideoId: row.youtube_video_id,
    title: row.title,
    youtubePlaylistId: row.youtube_playlist_id,
    playlistIndex: row.playlist_index === null ? null : Number(row.playlist_index),
    positionSeconds: position ?? 0,
    lastWatchedAt: row.started_at.toISOString(),
  };
}

export interface UserProgress {
  videos: HistoryRow[];
  resume: ResumePoint | null;
}

/** Per-video progress plus where to continue. */
export async function loadUserProgress(userId: number, limit = 200): Promise<UserProgress> {
  const [videos, resume] = await Promise.all([
    loadHistory(userId, limit),
    loadResumePoint(userId),
  ]);
  return { videos, resume };
}

export interface LifetimeTotals {
  videoCount: number;
  sessionCount: number;
  watchedSeconds: number;
  skippedSeconds: number;
  studySeconds: number;
  entertainmentSeconds: number;
  otherSeconds: number;
  completedVideoCount: number;
  firstWatchedAt: string | null;
}

/**
 * All-time totals, derived from the same per-video history the History page
 * shows so the two can never disagree.
 */
export async function loadLifetimeTotals(userId: number): Promise<LifetimeTotals> {
  const videos = await loadHistory(userId, 5000);

  const categories = await query<{ youtube_video_id: string; category: string }>(
    `SELECT youtube_video_id, category FROM videos WHERE youtube_video_id = ANY($1::text[])`,
    [videos.map((v) => v.youtubeVideoId)],
  );
  const categoryById = new Map(categories.map((c) => [c.youtube_video_id, c.category]));

  const totals: LifetimeTotals = {
    videoCount: videos.length,
    sessionCount: videos.reduce((sum, v) => sum + v.sessionCount, 0),
    watchedSeconds: 0,
    skippedSeconds: 0,
    studySeconds: 0,
    entertainmentSeconds: 0,
    otherSeconds: 0,
    completedVideoCount: 0,
    firstWatchedAt: null,
  };

  for (const video of videos) {
    totals.watchedSeconds += video.watchedSeconds;
    totals.skippedSeconds += video.skippedSeconds;
    if (video.watchedPercentage >= 0.9) totals.completedVideoCount += 1;

    const category = categoryById.get(video.youtubeVideoId) ?? video.category;
    if (category === 'STUDY') totals.studySeconds += video.watchedSeconds;
    else if (category === 'ENTERTAINMENT') totals.entertainmentSeconds += video.watchedSeconds;
    else totals.otherSeconds += video.watchedSeconds;

    if (totals.firstWatchedAt === null || video.lastWatchedAt < totals.firstWatchedAt) {
      totals.firstWatchedAt = video.lastWatchedAt;
    }
  }

  return totals;
}
