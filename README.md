# WatchLens

**A YouTube learning-time tracker that measures what you actually watched, not what played.**

Open a 60-minute lecture, watch two minutes, drag the scrubber to 55:00 and let it finish, and
YouTube's own history makes it look like you watched the whole hour. WatchLens reconstructs the
real picture:

```
Video duration:       60 min
Actual watched:        7 min
Skipped:              53 min
Reached end:          Yes
```

---

## How it works

```
User Browser
     │
     ├──────────────►  YouTube          (video streaming — direct, never proxied)
     │
     └──────────────►  WatchLens       (small JSON batches of player events)
```

Video bytes go straight from YouTube's CDN to the browser through the official IFrame Player API.
The server only ever receives a few hundred bytes of event JSON every ten seconds. Nothing is
proxied, downloaded, cached or re-served.

### The watch-time algorithm

The naive `lastPosition - firstPosition` is exactly the bug this project exists to fix. Instead,
[`src/lib/watch-time.ts`](src/lib/watch-time.ts) replays the raw event log as a state machine and
emits the spans of the timeline the player genuinely ran through:

| Event | Effect on the current span |
|---|---|
| `PLAY` | opens a span at the current position |
| `PAUSE` / `END` | closes the span |
| `SEEK` | **closes the span at `previous_video_time`, opens a new one at `video_time`** |
| `TAB_HIDDEN` / `TAB_VISIBLE` | closes / reopens (background audio is not study time) |
| `HEARTBEAT` | checkpoint every 5s, so a killed tab loses at most one interval |

Spans are then merged, so a rewatched section counts once. The reported figures are:

- **`watched`** — union of all spans (rewatching 0–60 then 30–90 is 90s, not 120s)
- **`reached`** — furthest position arrived at
- **`skipped`** — `reached − watched`, i.e. the gaps *inside* the region you got to

That last definition matters. Abandoning a 60-minute video after 10 honest minutes is **10 watched,
0 skipped, 50 never opened** — not "50 minutes skipped".

**Two independent safeguards against over-counting:**

1. A seek closes the span at the position you left, so the jumped-over region is never inside any
   span in the first place.
2. Every span is cross-checked against wall-clock time. A span can never be longer than the real
   seconds that elapsed while it was open × 2.5 (YouTube's max rate, plus slack). So even if a
   `SEEK` event is lost to a dropped request or a killed tab, physics caps the damage.

### Handled cases

Rewatching · seeking backward · seeking forward · pause/resume · closing the tab · switching tabs ·
video ending · refreshing the page · network interruptions · multiple sessions for the same video ·
playback-rate changes · lost events · playlist auto-advance · a session that failed to open.

---

## Playlists

Paste a playlist link and the whole course opens with a sidebar beside the player. A link carrying
both `v=` and `list=` opens as a playlist, matching what YouTube itself does.

- Click any video, or use Previous / Next.
- The playlist auto-advances at the end of each video and the sidebar follows.
- Each video is tracked as its own set of sessions, so `✓ / ◐ / ○` and the per-video percentage are
  the same numbers the history page reports.
- Reopening a playlist continues from the video you stopped on — and moves to the next one if you
  had already finished it.

The panel underneath aggregates the whole playlist: videos, completed, in progress, not started,
actual study time, total duration, skipped time, and real progress.

**Playlists work without a YouTube API key.** The IFrame player itself reports the playlist's
contents and order, and titles come from oEmbed. The one thing neither provides is *duration*, so
durations fill in as you open each video and the panel says so meanwhile. Set `YOUTUBE_API_KEY` and
every duration is known up front instead.

---

## The persistent player

Navigating from Watch to History and back does not disturb the video. It keeps playing, at the same
position, with the same playlist, volume, speed and watch session.

This works because the player is mounted in the **root layout**
([`src/components/AppShell.tsx`](src/components/AppShell.tsx)), not in any page. Next.js does not
unmount a layout when the routed segment changes, so the iframe is never destroyed. Off the Watch
route the *same DOM node* is restyled into a corner mini-player; nothing is re-parented, because
moving an iframe in the DOM reloads it and would restart playback.

A hard reload is the one case a player genuinely cannot survive. For that, the video, playlist,
index and position are mirrored to `localStorage` and the video reopens where you left it.

---

## Your data belongs to your account

Everything WatchLens records is stored in Postgres against the authenticated
`user_id` — never in the browser. Sign out, clear the browser, switch to your phone: sign back in
and it is all still there.

**Persisted per account:** watch history · actual watched time · skipped time · watch sessions ·
raw playback events · per-video progress and last position · playlists · playlist progress · daily
and weekly statistics · study and entertainment time · resume point.

**Signing out ends the session and nothing else.** No history, analytics, playlist or statistic is
deleted, and no rows are touched. The only thing cleared is the browser's cached "which video was
on screen", so the next person to use that browser does not inherit it. Deleting data is a separate,
explicit action on `/privacy`.

**localStorage holds one thing:** which video is currently open, plus volume and speed. It is a
cache for surviving a page refresh. When it is empty — a new device, a cleared browser, a fresh
login — the player asks `GET /api/user/progress` and restores from the database instead.

### Isolation

Every user-scoped query filters on the id from the session cookie, resolved on the server. There is
no endpoint that takes a user id as a parameter, so there is nothing to tamper with:

- Reads (`loadSessions`, `loadHistory`, `coverageForVideos`, `lastPositionFor`, everything in
  `user-data.ts`) all filter by `user_id`.
- `watch_events` carries its own `user_id` alongside `session_id`. It is derivable through the
  session, but storing it means an ownership check never depends on remembering to join.
- Writes verify ownership first: `POST /api/events` filters the submitted session ids to those
  belonging to the caller and rejects the batch otherwise. The `user_id` written comes from the
  cookie, never the request body.
- The browser is never trusted to scope anything.

`tests/integration/user-isolation.test.ts` proves this against a real Postgres — two accounts, and
assertions that neither can see or write the other's rows. It skips when `DATABASE_URL` is unset:

```bash
DATABASE_URL=postgresql://postgres:postgres@127.0.0.1:55432/watchlens npm test
```

Video and playlist *metadata* (title, channel, duration, the playlist's contents) is deliberately
shared across accounts — it is public YouTube data and describes nobody. Only watching does.

---

## Tech stack

| Layer | Choice |
|---|---|
| Frontend | Next.js 15 (App Router), React 19, TypeScript, Tailwind CSS v4 |
| Charts | Recharts |
| Player | YouTube IFrame Player API |
| Backend | Next.js API routes (Node runtime) |
| Database | PostgreSQL via `pg` — raw SQL, no ORM |
| Tests | Vitest |

No separate backend service. No ORM. No auth library. The MVP stays small on purpose.

---

## Setup

**Requirements:** Node 20+ and any PostgreSQL database (local, Neon, Supabase, RDS…).

```bash
git clone https://github.com/Sahilsigar23/WatchLens.git
cd WatchLens
npm install
cp .env.example .env.local
```

Fill in `.env.local`:

```bash
DATABASE_URL=postgresql://postgres:postgres@localhost:5432/watchlens
PGSSL=false
SESSION_SECRET=<paste a long random string>
YOUTUBE_API_KEY=            # optional, only for the search box
```

Generate a session secret:

```bash
node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"
```

Create the tables, then start:

```bash
npm run db:migrate
```

```bash
npm run dev
```

Open <http://localhost:3000>, enter an email, paste a YouTube link, and watch.

### Other commands

```bash
npm test
```

```bash
npm run build
```

---

## Environment variables

| Variable | Required | Purpose |
|---|---|---|
| `DATABASE_URL` | yes | Postgres connection string. **On Vercel use the pooled endpoint** (Neon `-pooler` host, Supabase port 6543). |
| `SESSION_SECRET` | yes | HMAC key for the session cookie. Any long random string. |
| `PGSSL` | no | Set `true` when the provider needs TLS with a self-signed chain (Neon, Supabase, Heroku). |
| `YOUTUBE_API_KEY` | no | Enables the in-app search box. Without it you can still paste any link or video id. |

---

## Database

Schema lives in [`db/schema.sql`](db/schema.sql); `npm run db:migrate` applies it. Every statement is
`IF NOT EXISTS`, so re-running is safe. You can also paste the file into `psql` or the Neon /
Supabase SQL editor.

```
users            id · email · created_at
videos           id · youtube_video_id · title · channel_name · duration_seconds · category · created_at
playlists        id · youtube_playlist_id · title · created_at
playlist_items   playlist_id → playlists · position · video_id → videos
watch_sessions   id · user_id → users · video_id → videos · started_at · ended_at
                 · playlist_id → playlists (nullable) · playlist_index (nullable)
watch_events     id · session_id → watch_sessions · user_id → users · event_type · video_time
                 · previous_video_time · timestamp · client_event_id
```

A playlist holds no watch data of its own — every figure on the playlist panel is derived from the
same `watch_events` log as everything else, so playlist progress and history can never disagree.
`playlist_id` / `playlist_index` on a session are nullable, and a standalone video stores neither.

`watch_events` is append-only and is the single source of truth — all analytics are derived from it
at read time, so improving the algorithm improves past history with no migration.

Two details worth knowing:

- **`client_event_id`** has a unique index. A batch retried after a network error inserts nothing
  the second time, so a retry can never double-count.
- **`ON DELETE CASCADE`** runs from users → sessions → events, which is what makes the delete
  buttons on `/privacy` real deletes rather than flags.

---

## API

| Route | Purpose |
|---|---|
| `POST /api/auth` · `GET` · `DELETE` | sign in / whoami / sign out |
| `POST /api/session` | open a watch session, returns `sessionId` and a resume position |
| `POST /api/playlist` | playlist contents, per-video progress, aggregate panel, resume index |
| `POST /api/events` | batched event ingest (~1 request / 10s) |
| `GET /api/stats/today?tz=` | today's learning report |
| `GET /api/stats/weekly?tz=` | Monday–Sunday rollup |
| `GET /api/history` | all-time per-video table |
| `GET /api/user/history` | the account's watch history |
| `GET /api/user/playlists` | every playlist watched, with progress and resume index |
| `GET /api/user/statistics?tz=` | today + this week + all-time totals |
| `GET /api/user/progress` | per-video progress and the point to resume from |
| `GET /api/search?q=` | optional YouTube search (metadata only) |
| `DELETE /api/account?scope=history\|account` | erase history or the whole account |

Every route above resolves the user from the session cookie server-side and returns `401` when
signed out. None of them accept a user id.

---

## Playback performance

The tracking system is built so it cannot interfere with the video:

- Event capture is a synchronous array push. The 250 ms poll reads `getCurrentTime()`, an in-memory
  property on the player object — no network, no layout, no main-thread work of consequence.
- Requests go out **in batches every 10 seconds**, never once per second.
- The final flush uses `navigator.sendBeacon`, which the browser delivers after the page is gone.
- Failed batches are re-queued (capped at 500 events) and retried on the next tick. A 4xx drops the
  batch rather than wedging the queue forever.
- Analytics fetching is entirely separate from playback. If the API is down, the player keeps
  playing and the per-video numbers keep updating — they are computed in the browser with the same
  algorithm the server uses.
- Switching videos calls `loadVideoById` / `playVideoAt`, so there is no remount and no page reload.
- The player is created **once per visit**. Navigation, playlist changes and video changes all go
  through API calls on the existing player.
- `children` reaches the shell as a prop from the server layout, so a stats refresh or a player
  state change re-renders the shell without re-rendering the page below it. The playlist sidebar and
  analytics panel are `memo`ised so the 5-second heartbeat does not redraw twenty rows.
- The player uses YouTube's native controls: play/pause, seek, volume, playback speed, captions,
  quality and fullscreen all behave normally.

---

## Privacy

`/privacy` lists exactly what is recorded and what is not, in plain language, and the same summary
is shown on the watch page while a video is open. Users can delete their watch history or their
entire account from that page; both are immediate, real deletes.

### Authentication

Accounts are email + password.

- Passwords are hashed with **scrypt** (`N=16384, r=8, p=1`, 64-byte key, 16-byte random salt) using
  Node's standard library — no native addon to fail at build time. The stored format is
  `scrypt$N$r$p$salt$hash`, so the cost factors can be raised later without invalidating
  existing hashes.
- **No user enumeration.** An unknown address and a wrong password return the same message, and an
  unknown address still pays the full hashing cost so response time doesn't give it away either.
- **Brute-force throttling.** Eight failed sign-ins lock the account for 15 minutes; any success
  resets the counter.
- Rows created before passwords existed have a `NULL` hash and are refused rather than claimable —
  that would be the very hole passwords close. Delete and re-create such an account.

Two gaps, both stated in the UI and on `/privacy`:

- **No email verification** and **no password reset** — both need an outbound mail provider this
  app doesn't have. A forgotten password means deleting the account from `/privacy` and signing up
  again.
- Changing a password does not invalidate existing session cookies, which are `HMAC(user_id)`.

---

## Deploying to Vercel

Works on the Hobby/free plan. No video traffic passes through Vercel — only the site and small JSON
requests.

1. **Provision Postgres.** Neon or Supabase free tier is plenty. Copy the **pooled** connection
   string (Neon: the `-pooler` host; Supabase: port 6543). Serverless functions open many
   short-lived connections and a direct connection limit will run out.
2. **Create the tables.** Run `npm run db:migrate` locally against the production `DATABASE_URL`,
   or paste `db/schema.sql` into the provider's SQL editor.
3. **Import the repo** at [vercel.com/new](https://vercel.com/new). Framework preset: Next.js.
   Build settings need no changes.
4. **Set environment variables** for Production (and Preview, if you use it):
   `DATABASE_URL`, `SESSION_SECRET`, `PGSSL=true`, and optionally `YOUTUBE_API_KEY`.
5. **Deploy.**

All API routes are `runtime = 'nodejs'` and `dynamic = 'force-dynamic'`, which is what the `pg`
driver and per-user data require.

---

## Project structure

```
db/
  schema.sql              tables, indexes, cascades
  migrate.mjs             applies schema.sql to DATABASE_URL
src/
  app/
    layout.tsx            mounts AppShell — the reason the player survives navigation
    page.tsx              watch page (analytics only; the player lives in the layout)
    history/page.tsx      per-video history
    privacy/page.tsx      disclosure + delete controls
    api/                  auth · session · events · playlist · stats · history · search · account
    api/user/             history · playlists · statistics · progress (account-scoped reads)
  components/
    AppShell.tsx          ★ persistent layout + stats-refresh signal
    PlayerShell.tsx       ★ player state, playlist state, expanded / mini-player
    YouTubePlayer.tsx     IFrame Player API wrapper — created once, never remounted
    PlaylistSidebar.tsx   the video list, ✓ / ◐ / ○ and per-video progress
    PlaylistAnalytics.tsx aggregate playlist panel
    DashboardStats.tsx    today + weekly, refreshed independently of playback
    LiveSession.tsx       live per-video readout
    StatCards.tsx         today's numbers + learning report
    WeeklyChart.tsx       Recharts weekly bars
    HistoryTable.tsx      responsive table / cards
    VideoInput.tsx        video / playlist URL parsing + optional search
    Nav · CategoryBadge · TrackingNotice · DataControls · SignInCard · SetupNotice
  hooks/
    useWatchTracker.ts    player → events: seek detection, heartbeat, visibility
  lib/
    watch-time.ts         ★ the algorithm
    intervals.ts          merge / union / clamp
    analytics.ts          event log → daily, weekly, history, per-video coverage
    user-data.ts          account-scoped reads: playlists, progress, resume, lifetime totals
    player-state.ts       the one thing kept in localStorage, cleared on sign-in/out
    playlist-progress.ts  coverage → sidebar rows + playlist panel (pure)
    playlist-meta.ts      playlist contents: Data API, or player ids + oEmbed
    tracker.ts            batching, retry, sendBeacon, session windows
    classify.ts           STUDY / ENTERTAINMENT / OTHER (pluggable)
    youtube.ts            video + playlist URL parsing, IFrame API loader
    youtube-meta.ts       oEmbed fallback for title/channel
    db · auth · dates · format · types
tests/
  watch-time.test.ts      19 tests, including the exact example from the brief
  playlist.test.ts        16 tests
  classify.test.ts        6 tests
  tracker.test.ts         5 tests
  query-params.test.ts    3 tests
  integration/
    user-isolation.test.ts  8 tests against a real Postgres; skipped without DATABASE_URL
```

---

## Classification

`src/lib/classify.ts` scores the title (weight 2) and channel (weight 1) against keyword lists and
returns `STUDY`, `ENTERTAINMENT`, or `OTHER`. Ties and no-matches both fall through to `OTHER` —
an honest unclassified bucket beats a coin flip polluting the study totals.

Swapping in an LLM later means implementing one method:

```ts
import { setClassifier } from '@/lib/classify';

setClassifier({
  async classify({ title, channelName }) {
    // call a model, return 'STUDY' | 'ENTERTAINMENT' | 'OTHER'
  },
});
```

No caller changes. A classifier that throws falls back to `OTHER` rather than blocking a session.

---

## Known limitations

- **No email verification and no password reset** (see Authentication above).
- **Search needs an API key.** Pasting links always works.
- **Some videos disallow embedding**; the player shows a clear message when that happens.
- **Analytics are computed per request** from the raw event log. That is fast for normal use (a
  week is tens of sessions); a very heavy user would eventually want a materialised
  `session_stats` table. The module shape would not change.
- **Background-tab audio is not counted** as watch time. Flip `COUNT_HIDDEN_TAB_TIME` in
  `src/lib/watch-time.ts` if you disagree.
