import { readFileSync } from 'node:fs';

import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import { coverageForVideos, lastPositionFor, loadHistory } from '@/lib/analytics';
import { query, queryOne } from '@/lib/db';
import { loadLifetimeTotals, loadResumePoint, loadUserPlaylists } from '@/lib/user-data';

/**
 * Ownership is enforced in the database layer, not the UI.
 *
 * These run against a real Postgres because that is the only way to prove the
 * claim: a mocked query layer would just be asserting that the mock returns
 * what the mock was told to return. They skip when DATABASE_URL is unset so
 * `npm test` stays runnable with no infrastructure.
 *
 *   docker run -d -e POSTGRES_PASSWORD=postgres -e POSTGRES_DB=watchlens \
 *     -p 55432:5432 postgres:16-alpine
 *   DATABASE_URL=postgresql://postgres:postgres@127.0.0.1:55432/watchlens npm test
 */

const hasDatabase = Boolean(process.env.DATABASE_URL);

// Unique per run so repeated runs, and runs against a database that already has
// real data in it, cannot collide or interfere.
const stamp = `${Date.now()}${Math.floor(Math.random() * 1000)}`;
const EMAIL_A = `iso-a-${stamp}@test.local`;
const EMAIL_B = `iso-b-${stamp}@test.local`;
const VIDEO_A = `isoA${stamp}`.slice(0, 11).padEnd(11, 'x');
const VIDEO_B = `isoB${stamp}`.slice(0, 11).padEnd(11, 'y');
const PLAYLIST_A = `PLiso${stamp}`.slice(0, 24);

let userA = 0;
let userB = 0;

/** Inserts a session with a PLAY/PAUSE pair covering `[0, seconds)`. */
async function seedSession(
  userId: number,
  videoDbId: number,
  seconds: number,
  playlistDbId: number | null = null,
  playlistIndex: number | null = null,
): Promise<number> {
  const session = await queryOne<{ id: string }>(
    `INSERT INTO watch_sessions (user_id, video_id, playlist_id, playlist_index)
     VALUES ($1, $2, $3, $4) RETURNING id`,
    [userId, videoDbId, playlistDbId, playlistIndex],
  );
  const sessionId = Number(session!.id);

  const start = new Date('2026-08-12T10:00:00Z');
  const end = new Date(start.getTime() + seconds * 1000);

  await query(
    `INSERT INTO watch_events (session_id, user_id, event_type, video_time, timestamp, client_event_id)
     VALUES ($1, $2, 'PLAY', 0, $3, $5), ($1, $2, 'PAUSE', $4, $6, $7)`,
    [
      sessionId,
      userId,
      start.toISOString(),
      seconds,
      `${sessionId}-play`,
      end.toISOString(),
      `${sessionId}-pause`,
    ],
  );

  return sessionId;
}

async function videoId(youtubeId: string, title: string, duration: number): Promise<number> {
  const row = await queryOne<{ id: string }>(
    `INSERT INTO videos (youtube_video_id, title, channel_name, duration_seconds, category)
     VALUES ($1, $2, 'Test Channel', $3, 'STUDY')
     ON CONFLICT (youtube_video_id) DO UPDATE SET title = EXCLUDED.title
     RETURNING id`,
    [youtubeId, title, duration],
  );
  return Number(row!.id);
}

describe.skipIf(!hasDatabase)('user data isolation', () => {
  beforeAll(async () => {
    await query(readFileSync('db/schema.sql', 'utf8'));

    const a = await queryOne<{ id: string }>(
      'INSERT INTO users (email) VALUES ($1) RETURNING id',
      [EMAIL_A],
    );
    const b = await queryOne<{ id: string }>(
      'INSERT INTO users (email) VALUES ($1) RETURNING id',
      [EMAIL_B],
    );
    userA = Number(a!.id);
    userB = Number(b!.id);

    const videoDbA = await videoId(VIDEO_A, 'A lecture', 600);
    const videoDbB = await videoId(VIDEO_B, 'B lecture', 600);

    const playlist = await queryOne<{ id: string }>(
      `INSERT INTO playlists (youtube_playlist_id, title) VALUES ($1, 'A course')
       ON CONFLICT (youtube_playlist_id) DO UPDATE SET title = EXCLUDED.title RETURNING id`,
      [PLAYLIST_A],
    );
    const playlistDb = Number(playlist!.id);
    await query(
      'INSERT INTO playlist_items (playlist_id, position, video_id) VALUES ($1, 0, $2) ON CONFLICT DO NOTHING',
      [playlistDb, videoDbA],
    );

    // A watched 300s of their video, inside a playlist. B watched 120s of theirs.
    await seedSession(userA, videoDbA, 300, playlistDb, 0);
    await seedSession(userB, videoDbB, 120);
  });

  afterAll(async () => {
    if (!hasDatabase) return;
    // Cascades remove sessions and events; shared video/playlist metadata rows
    // carry no ownership and are left alone.
    await query('DELETE FROM users WHERE email = ANY($1::text[])', [[EMAIL_A, EMAIL_B]]);
  });

  it('gives each account only its own history', async () => {
    const historyA = await loadHistory(userA);
    const historyB = await loadHistory(userB);

    expect(historyA.map((v) => v.youtubeVideoId)).toEqual([VIDEO_A]);
    expect(historyB.map((v) => v.youtubeVideoId)).toEqual([VIDEO_B]);
    expect(historyA[0].watchedSeconds).toBe(300);
    expect(historyB[0].watchedSeconds).toBe(120);
  });

  it('returns nothing when one account asks for another account\'s video', async () => {
    // The id is real and the data exists — it just does not belong to A.
    const coverage = await coverageForVideos(userA, [VIDEO_B]);
    expect(coverage.size).toBe(0);

    expect(await lastPositionFor(userA, VIDEO_B)).toBeNull();
  });

  it('keeps playlists per account', async () => {
    const playlistsA = await loadUserPlaylists(userA);
    const playlistsB = await loadUserPlaylists(userB);

    expect(playlistsA.map((p) => p.youtubePlaylistId)).toContain(PLAYLIST_A);
    expect(playlistsB.map((p) => p.youtubePlaylistId)).not.toContain(PLAYLIST_A);
  });

  it('keeps lifetime statistics per account', async () => {
    expect((await loadLifetimeTotals(userA)).watchedSeconds).toBe(300);
    expect((await loadLifetimeTotals(userB)).watchedSeconds).toBe(120);
  });

  it('resumes each account at its own video', async () => {
    expect((await loadResumePoint(userA))?.youtubeVideoId).toBe(VIDEO_A);
    expect((await loadResumePoint(userB))?.youtubeVideoId).toBe(VIDEO_B);
  });

  it('survives a sign-out, which touches no rows', async () => {
    // Signing out only clears a cookie. Nothing in the data layer is called, so
    // the assertion is simply that the rows are still all there afterwards.
    const before = await loadHistory(userA);
    const events = await query<{ n: string }>(
      'SELECT count(*) AS n FROM watch_events WHERE user_id = $1',
      [userA],
    );

    expect(before).toHaveLength(1);
    expect(Number(events[0].n)).toBe(2);
  });

  it('stamps every event with its owner', async () => {
    const orphans = await query<{ n: string }>(
      `SELECT count(*) AS n
         FROM watch_events e JOIN watch_sessions s ON s.id = e.session_id
        WHERE e.user_id <> s.user_id`,
    );
    expect(Number(orphans[0].n)).toBe(0);
  });

  it('removes only the leaving account\'s data', async () => {
    const extra = await queryOne<{ id: string }>(
      'INSERT INTO users (email) VALUES ($1) RETURNING id',
      [`iso-c-${stamp}@test.local`],
    );
    const userC = Number(extra!.id);
    const videoDbA = await videoId(VIDEO_A, 'A lecture', 600);
    await seedSession(userC, videoDbA, 60);

    await query('DELETE FROM users WHERE id = $1', [userC]);

    // A watched the same video; deleting C must not have touched A's rows.
    const historyA = await loadHistory(userA);
    expect(historyA).toHaveLength(1);
    expect(historyA[0].watchedSeconds).toBe(300);
  });
});
