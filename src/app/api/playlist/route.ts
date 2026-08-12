import { NextResponse } from 'next/server';

import { coverageForVideos } from '@/lib/analytics';
import { requireUserId, UnauthorizedError } from '@/lib/auth';
import { classifyVideo } from '@/lib/classify';
import { query, queryOne } from '@/lib/db';
import { fetchPlaylistItems, fetchPlaylistTitle, MAX_PLAYLIST_ITEMS } from '@/lib/playlist-meta';
import { resumeIndexFor, summarizePlaylist } from '@/lib/playlist-progress';
import type { PlaylistSummary } from '@/lib/types';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/**
 * POST /api/playlist
 *
 * Body: `{ youtubePlaylistId, videoIds?: string[] }`
 *
 * Returns the ordered playlist with this user's progress on each video, plus
 * the aggregate panel figures and the index to continue from.
 *
 * `videoIds` are what the browser's IFrame player reported. They matter because
 * they let playlists work with no YouTube Data API key at all — the player has
 * already told us the contents and their order.
 *
 * Metadata only; no video bytes pass through here.
 */
export async function POST(request: Request) {
  try {
    const userId = await requireUserId();
    const body = (await request.json()) as {
      youtubePlaylistId?: string;
      videoIds?: string[];
    };

    const playlistId = String(body.youtubePlaylistId ?? '').trim();
    if (!/^[\w-]{12,64}$/.test(playlistId)) {
      return NextResponse.json({ error: 'Invalid playlist id' }, { status: 400 });
    }

    const playerVideoIds = Array.isArray(body.videoIds)
      ? body.videoIds.filter((id) => typeof id === 'string').slice(0, MAX_PLAYLIST_ITEMS)
      : [];

    const [items, title] = await Promise.all([
      fetchPlaylistItems(playlistId, playerVideoIds),
      fetchPlaylistTitle(playlistId),
    ]);

    if (items.length === 0) {
      return NextResponse.json(
        { error: 'That playlist is empty, private, or cannot be embedded.' },
        { status: 404 },
      );
    }

    // --- Persist the playlist and its ordering ------------------------------

    const playlistRow = await queryOne<{ id: string }>(
      `INSERT INTO playlists (youtube_playlist_id, title)
       VALUES ($1, $2)
       ON CONFLICT (youtube_playlist_id) DO UPDATE SET
         title = CASE WHEN EXCLUDED.title <> '' THEN EXCLUDED.title ELSE playlists.title END
       RETURNING id`,
      [playlistId, title],
    );
    if (!playlistRow) throw new Error('Could not upsert the playlist');
    const playlistDbId = Number(playlistRow.id);

    // Videos are upserted the same way /api/session does it: never blank out
    // metadata we already hold with an empty value from a partial source.
    const categories = await Promise.all(
      items.map((item) => classifyVideo({ title: item.title, channelName: item.channelName })),
    );

    const videoRows = await query<{ id: string; youtube_video_id: string }>(
      `INSERT INTO videos (youtube_video_id, title, channel_name, duration_seconds, category)
       SELECT * FROM UNNEST($1::text[], $2::text[], $3::text[], $4::integer[], $5::text[])
       ON CONFLICT (youtube_video_id) DO UPDATE SET
         title            = CASE WHEN EXCLUDED.title <> '' THEN EXCLUDED.title
                                 ELSE videos.title END,
         channel_name     = CASE WHEN EXCLUDED.channel_name <> '' THEN EXCLUDED.channel_name
                                 ELSE videos.channel_name END,
         duration_seconds = CASE WHEN EXCLUDED.duration_seconds > 0 THEN EXCLUDED.duration_seconds
                                 ELSE videos.duration_seconds END,
         category         = CASE WHEN EXCLUDED.title <> '' THEN EXCLUDED.category
                                 ELSE videos.category END
       RETURNING id, youtube_video_id`,
      [
        items.map((i) => i.youtubeVideoId),
        items.map((i) => i.title.slice(0, 500)),
        items.map((i) => i.channelName.slice(0, 300)),
        items.map((i) => Math.max(0, Math.round(i.durationSeconds))),
        categories,
      ],
    );

    const videoDbIdByYoutubeId = new Map(
      videoRows.map((row) => [row.youtube_video_id, Number(row.id)]),
    );

    // Replace the ordering wholesale: a video removed from the playlist on
    // YouTube must not linger in our copy, and positions shift on re-order.
    await query('DELETE FROM playlist_items WHERE playlist_id = $1', [playlistDbId]);
    await query(
      `INSERT INTO playlist_items (playlist_id, position, video_id)
       SELECT * FROM UNNEST($1::bigint[], $2::integer[], $3::bigint[])
       ON CONFLICT (playlist_id, position) DO NOTHING`,
      [
        items.map(() => playlistDbId),
        items.map((_, index) => index),
        items.map((i) => videoDbIdByYoutubeId.get(i.youtubeVideoId) ?? 0),
      ],
    );

    // --- Progress -----------------------------------------------------------

    const coverage = await coverageForVideos(
      userId,
      items.map((i) => i.youtubeVideoId),
    );

    const { items: summaryItems, analytics } = summarizePlaylist(items, coverage);

    // --- Where to continue from --------------------------------------------

    const lastSession = await queryOne<{ playlist_index: number | null }>(
      `SELECT playlist_index
         FROM watch_sessions
        WHERE user_id = $1 AND playlist_id = $2 AND playlist_index IS NOT NULL
        ORDER BY started_at DESC
        LIMIT 1`,
      [userId, playlistDbId],
    );

    const summary: PlaylistSummary = {
      youtubePlaylistId: playlistId,
      title,
      items: summaryItems,
      analytics,
      resumeIndex: resumeIndexFor(summaryItems, lastSession?.playlist_index ?? null),
    };

    return NextResponse.json(summary);
  } catch (error) {
    if (error instanceof UnauthorizedError) {
      return NextResponse.json({ error: 'Not signed in' }, { status: 401 });
    }
    console.error('POST /api/playlist failed:', error);
    return NextResponse.json({ error: 'Could not load the playlist' }, { status: 500 });
  }
}
