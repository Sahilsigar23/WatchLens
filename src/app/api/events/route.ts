import { NextResponse } from 'next/server';

import { requireUserId, UnauthorizedError } from '@/lib/auth';
import { query } from '@/lib/db';
import { EVENT_TYPES, type EventType, type TrackedEvent } from '@/lib/types';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/** Rejects absurd batches outright rather than trying to store them. */
const MAX_EVENTS_PER_REQUEST = 500;

const VALID_TYPES = new Set<string>(EVENT_TYPES);

/**
 * POST /api/events
 *
 * Accepts a batch of player events. Called roughly once every ten seconds while
 * watching, plus a `sendBeacon` on page unload — never once per second.
 *
 * The whole batch is written in a single statement, and duplicate
 * `clientEventId`s are ignored, so a batch retried after a network blip cannot
 * double-count.
 */
export async function POST(request: Request) {
  try {
    const userId = await requireUserId();
    const body = (await request.json()) as { events?: TrackedEvent[] };
    const incoming = Array.isArray(body.events) ? body.events : [];

    if (incoming.length === 0) return NextResponse.json({ inserted: 0 });
    if (incoming.length > MAX_EVENTS_PER_REQUEST) {
      return NextResponse.json({ error: 'Batch too large' }, { status: 400 });
    }

    const events = incoming.filter(
      (e) =>
        VALID_TYPES.has(e?.type) &&
        Number.isInteger(e?.sessionId) &&
        e.sessionId > 0 &&
        Number.isFinite(e?.videoTime) &&
        Number.isFinite(e?.timestamp),
    );
    if (events.length === 0) return NextResponse.json({ inserted: 0 });

    // Only accept events for sessions this user owns. Without this check any
    // signed-in user could write events into someone else's session.
    const claimedSessionIds = [...new Set(events.map((e) => e.sessionId))];
    const owned = await query<{ id: string }>(
      'SELECT id FROM watch_sessions WHERE user_id = $1 AND id = ANY($2::bigint[])',
      [userId, claimedSessionIds],
    );
    const ownedIds = new Set(owned.map((row) => Number(row.id)));

    const accepted = events.filter((e) => ownedIds.has(e.sessionId));
    if (accepted.length === 0) {
      return NextResponse.json({ error: 'Unknown session' }, { status: 400 });
    }

    // `user_id` comes from the session cookie, never from the request body, so
    // a client cannot write events into another account even if it guessed a
    // session id — that id has already been filtered to this user above.
    await query(
      `INSERT INTO watch_events
         (session_id, user_id, event_type, video_time, previous_video_time,
          timestamp, client_event_id)
       SELECT * FROM UNNEST(
         $1::bigint[], $2::bigint[], $3::text[], $4::double precision[],
         $5::double precision[], $6::timestamptz[], $7::text[]
       )
       ON CONFLICT (client_event_id) WHERE client_event_id IS NOT NULL DO NOTHING`,
      [
        accepted.map((e) => e.sessionId),
        accepted.map(() => userId),
        accepted.map((e) => e.type as EventType),
        accepted.map((e) => e.videoTime),
        accepted.map((e) =>
          Number.isFinite(e.previousVideoTime) ? (e.previousVideoTime as number) : null,
        ),
        accepted.map((e) => new Date(e.timestamp).toISOString()),
        accepted.map((e) => e.clientEventId ?? null),
      ],
    );

    // Keep `ended_at` moving forward with the newest event we have seen. This
    // means a session whose tab was killed still has a sensible end time, with
    // no dependence on the SESSION_END beacon actually arriving.
    const latestPerSession = new Map<number, number>();
    for (const event of accepted) {
      const current = latestPerSession.get(event.sessionId) ?? 0;
      if (event.timestamp > current) latestPerSession.set(event.sessionId, event.timestamp);
    }

    await Promise.all(
      [...latestPerSession].map(([sessionId, timestamp]) =>
        query(
          `UPDATE watch_sessions
              SET ended_at = $2
            WHERE id = $1 AND user_id = $3 AND (ended_at IS NULL OR ended_at < $2)`,
          [sessionId, new Date(timestamp).toISOString(), userId],
        ),
      ),
    );

    return NextResponse.json({ inserted: accepted.length });
  } catch (error) {
    if (error instanceof UnauthorizedError) {
      return NextResponse.json({ error: 'Not signed in' }, { status: 401 });
    }
    console.error('POST /api/events failed:', error);
    return NextResponse.json({ error: 'Could not store events' }, { status: 500 });
  }
}
