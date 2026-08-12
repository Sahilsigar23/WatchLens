import { NextResponse } from 'next/server';

import { lastPositionFor } from '@/lib/analytics';
import { requireUserId, UnauthorizedError } from '@/lib/auth';
import { classifyVideo } from '@/lib/classify';
import { queryOne } from '@/lib/db';
import { fetchVideoMeta } from '@/lib/youtube-meta';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/**
 * POST /api/session
 *
 * Opens a watch session. The browser calls this once when the player becomes
 * ready and again whenever the video changes. Metadata comes from the player's
 * own `getVideoData()` — no YouTube Data API key needed, and no video bytes
 * pass through this server.
 */
export async function POST(request: Request) {
  try {
    const userId = await requireUserId();
    const body = (await request.json()) as {
      youtubeVideoId?: string;
      title?: string;
      channelName?: string;
      durationSeconds?: number;
      youtubePlaylistId?: string | null;
      playlistIndex?: number | null;
    };

    const youtubeVideoId = String(body.youtubeVideoId ?? '').trim();
    if (!/^[\w-]{11}$/.test(youtubeVideoId)) {
      return NextResponse.json({ error: 'Invalid video id' }, { status: 400 });
    }

    let title = String(body.title ?? '').slice(0, 500);
    let channelName = String(body.channelName ?? '').slice(0, 300);
    const durationSeconds = Math.max(0, Math.round(Number(body.durationSeconds) || 0));

    // The player reliably reports the duration but frequently returns an empty
    // `author`, so fill the gaps from oEmbed before classifying — the channel
    // name is one of the classifier's inputs.
    if (!title || !channelName) {
      const meta = await fetchVideoMeta(youtubeVideoId);
      if (meta) {
        title = title || meta.title.slice(0, 500);
        channelName = channelName || meta.channelName.slice(0, 300);
      }
    }

    const category = await classifyVideo({ title, channelName });

    // Keep the newest non-empty metadata. A player that has not resolved its
    // title yet must not blank out a title we already have.
    const video = await queryOne<{ id: string }>(
      `INSERT INTO videos (youtube_video_id, title, channel_name, duration_seconds, category)
       VALUES ($1, $2, $3, $4, $5)
       ON CONFLICT (youtube_video_id) DO UPDATE SET
         title            = CASE WHEN EXCLUDED.title <> '' THEN EXCLUDED.title
                                 ELSE videos.title END,
         channel_name     = CASE WHEN EXCLUDED.channel_name <> '' THEN EXCLUDED.channel_name
                                 ELSE videos.channel_name END,
         duration_seconds = CASE WHEN EXCLUDED.duration_seconds > 0 THEN EXCLUDED.duration_seconds
                                 ELSE videos.duration_seconds END,
         category         = CASE WHEN EXCLUDED.title <> '' THEN EXCLUDED.category
                                 ELSE videos.category END
       RETURNING id`,
      [youtubeVideoId, title, channelName, durationSeconds, category],
    );
    if (!video) throw new Error('Could not upsert the video');

    // Read the resume point before inserting the new session so the fresh
    // (still empty) session cannot influence it.
    const lastPosition = await lastPositionFor(userId, youtubeVideoId);

    // Playlist context is optional. A standalone video sends neither field and
    // the session is stored exactly as it was before playlists existed.
    const rawPlaylistId = String(body.youtubePlaylistId ?? '').trim();
    let playlistDbId: number | null = null;
    if (/^[\w-]{12,64}$/.test(rawPlaylistId)) {
      const row = await queryOne<{ id: string }>(
        'SELECT id FROM playlists WHERE youtube_playlist_id = $1',
        [rawPlaylistId],
      );
      playlistDbId = row ? Number(row.id) : null;
    }

    const rawIndex = Number(body.playlistIndex);
    const playlistIndex =
      playlistDbId !== null && Number.isInteger(rawIndex) && rawIndex >= 0 ? rawIndex : null;

    const session = await queryOne<{ id: string }>(
      `INSERT INTO watch_sessions (user_id, video_id, playlist_id, playlist_index)
       VALUES ($1, $2, $3, $4) RETURNING id`,
      [userId, Number(video.id), playlistDbId, playlistIndex],
    );
    if (!session) throw new Error('Could not create the session');

    return NextResponse.json({
      sessionId: Number(session.id),
      category,
      lastPosition,
    });
  } catch (error) {
    if (error instanceof UnauthorizedError) {
      return NextResponse.json({ error: 'Not signed in' }, { status: 401 });
    }
    console.error('POST /api/session failed:', error);
    return NextResponse.json({ error: 'Could not start the session' }, { status: 500 });
  }
}
