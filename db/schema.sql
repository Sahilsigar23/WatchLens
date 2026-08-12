-- ---------------------------------------------------------------------------
-- WatchLens schema
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

-- Ownership is recorded directly on the event as well as through its session.
-- Strictly it is derivable via watch_sessions, but carrying it here means an
-- ownership check never depends on remembering to join, and any query that
-- forgets the filter fails closed on an obviously-missing column rather than
-- silently returning another user's rows.
ALTER TABLE watch_events ADD COLUMN IF NOT EXISTS user_id BIGINT
  REFERENCES users(id) ON DELETE CASCADE;

-- Backfill before the NOT NULL below, so an existing database upgrades cleanly.
UPDATE watch_events e
   SET user_id = s.user_id
  FROM watch_sessions s
 WHERE e.session_id = s.id AND e.user_id IS NULL;

ALTER TABLE watch_events ALTER COLUMN user_id SET NOT NULL;

CREATE INDEX IF NOT EXISTS watch_events_user_idx ON watch_events (user_id);

-- A retried batch inserts the same client_event_id twice; this makes the second
-- insert a no-op instead of a duplicate PLAY that would corrupt the intervals.
CREATE UNIQUE INDEX IF NOT EXISTS watch_events_client_event_id_key
  ON watch_events (client_event_id)
  WHERE client_event_id IS NOT NULL;

-- ---------------------------------------------------------------------------
-- Playlists
--
-- A playlist is just an ordered list of videos, so it needs no watch data of
-- its own: every figure on the playlist panel is derived from the same
-- watch_events log as everything else. That keeps one source of truth and means
-- playlist progress and history can never disagree.
-- ---------------------------------------------------------------------------

CREATE TABLE IF NOT EXISTS playlists (
  id                   BIGSERIAL PRIMARY KEY,
  youtube_playlist_id  TEXT NOT NULL UNIQUE,
  title                TEXT NOT NULL DEFAULT '',
  created_at           TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- `position` is the video's index within the playlist, matching the index the
-- IFrame player reports. Re-ordering a playlist on YouTube rewrites these rows.
CREATE TABLE IF NOT EXISTS playlist_items (
  playlist_id  BIGINT NOT NULL REFERENCES playlists(id) ON DELETE CASCADE,
  position     INTEGER NOT NULL,
  video_id     BIGINT NOT NULL REFERENCES videos(id) ON DELETE CASCADE,
  PRIMARY KEY (playlist_id, position)
);

CREATE INDEX IF NOT EXISTS playlist_items_video_idx ON playlist_items (video_id);

-- Which playlist (if any) a session was watched from. Nullable: a standalone
-- video has no playlist, and the whole tracking path works exactly as before
-- when these are NULL.
ALTER TABLE watch_sessions ADD COLUMN IF NOT EXISTS playlist_id BIGINT
  REFERENCES playlists(id) ON DELETE SET NULL;
ALTER TABLE watch_sessions ADD COLUMN IF NOT EXISTS playlist_index INTEGER;

-- Powers "continue where you stopped": the most recent session carrying this
-- playlist gives back the index the user was last on.
CREATE INDEX IF NOT EXISTS watch_sessions_user_playlist_idx
  ON watch_sessions (user_id, playlist_id, started_at DESC)
  WHERE playlist_id IS NOT NULL;
