-- ---------------------------------------------------------------------------
-- StudyTrace schema
--
-- Run with:  npm run db:migrate
-- Or paste straight into psql / the Neon / Supabase SQL editor.
--
-- Every statement is idempotent, so re-running is safe.
-- ---------------------------------------------------------------------------

CREATE TABLE IF NOT EXISTS users (
  id          BIGSERIAL PRIMARY KEY,
  email       TEXT NOT NULL UNIQUE,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS videos (
  id                BIGSERIAL PRIMARY KEY,
  youtube_video_id  TEXT NOT NULL UNIQUE,
  title             TEXT NOT NULL DEFAULT '',
  channel_name      TEXT NOT NULL DEFAULT '',
  duration_seconds  INTEGER NOT NULL DEFAULT 0,
  -- STUDY | ENTERTAINMENT | OTHER, produced by src/lib/classify.ts
  category          TEXT NOT NULL DEFAULT 'OTHER',
  created_at        TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS watch_sessions (
  id          BIGSERIAL PRIMARY KEY,
  user_id     BIGINT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  video_id    BIGINT NOT NULL REFERENCES videos(id) ON DELETE CASCADE,
  started_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
  ended_at    TIMESTAMPTZ
);

CREATE INDEX IF NOT EXISTS watch_sessions_user_started_idx
  ON watch_sessions (user_id, started_at DESC);

CREATE INDEX IF NOT EXISTS watch_sessions_user_video_idx
  ON watch_sessions (user_id, video_id);

-- Raw, append-only event log. The watch-time algorithm is a pure function of
-- these rows (see src/lib/watch-time.ts), so analytics can always be recomputed
-- from scratch if the algorithm improves.
CREATE TABLE IF NOT EXISTS watch_events (
  id                   BIGSERIAL PRIMARY KEY,
  session_id           BIGINT NOT NULL REFERENCES watch_sessions(id) ON DELETE CASCADE,
  -- PLAY | PAUSE | SEEK | END | TAB_VISIBLE | TAB_HIDDEN | VIDEO_CHANGE
  -- | HEARTBEAT | SESSION_END
  event_type           TEXT NOT NULL,
  -- Player position in seconds when the event fired.
  video_time           DOUBLE PRECISION NOT NULL,
  -- Only set for SEEK: the position the user jumped *away from*.
  previous_video_time  DOUBLE PRECISION,
  -- Wall-clock time the event fired in the browser.
  timestamp            TIMESTAMPTZ NOT NULL DEFAULT now(),
  -- Guards against double-inserting a batch that was retried after a network
  -- error. Generated in the browser, unique per event.
  client_event_id      TEXT
);

CREATE INDEX IF NOT EXISTS watch_events_session_idx
  ON watch_events (session_id, timestamp, id);

-- A retried batch inserts the same client_event_id twice; this makes the second
-- insert a no-op instead of a duplicate PLAY that would corrupt the intervals.
CREATE UNIQUE INDEX IF NOT EXISTS watch_events_client_event_id_key
  ON watch_events (client_event_id)
  WHERE client_event_id IS NOT NULL;
