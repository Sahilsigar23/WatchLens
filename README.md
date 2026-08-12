# StudyTrace

**A YouTube learning-time tracker that measures what you actually watched, not what played.**

Open a 60-minute lecture, watch two minutes, drag the scrubber to 55:00 and let it finish, and
YouTube's own history makes it look like you watched the whole hour. StudyTrace reconstructs the
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
     └──────────────►  StudyTrace       (small JSON batches of player events)
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
playback-rate changes · lost events.

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
git clone https://github.com/Sahilsigar23/StudyTrace.git
cd StudyTrace
npm install
cp .env.example .env.local
```

Fill in `.env.local`:

```bash
DATABASE_URL=postgresql://postgres:postgres@localhost:5432/studytrace
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
watch_sessions   id · user_id → users · video_id → videos · started_at · ended_at
watch_events     id · session_id → watch_sessions · event_type · video_time · previous_video_time
                 · timestamp · client_event_id
```

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
| `POST /api/events` | batched event ingest (~1 request / 10s) |
| `GET /api/stats/today?tz=` | today's learning report |
| `GET /api/stats/weekly?tz=` | Monday–Sunday rollup |
| `GET /api/history` | all-time per-video table |
| `GET /api/search?q=` | optional YouTube search (metadata only) |
| `DELETE /api/account?scope=history\|account` | erase history or the whole account |

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
- Switching videos calls `loadVideoById`, so there is no remount and no page reload.
- The player uses YouTube's native controls: play/pause, seek, volume, playback speed, captions,
  quality and fullscreen all behave normally.

---

## Privacy

`/privacy` lists exactly what is recorded and what is not, in plain language, and the same summary
is shown on the watch page while a video is open. Users can delete their watch history or their
entire account from that page; both are immediate, real deletes.

> **Sign-in is not authentication.** This MVP identifies you by an email address with no password
> and no verification — anyone who types your address into a given deployment sees your history.
> It exists so the app has a stable user id and a working delete path. Before exposing this to more
> than one person, replace `signIn` in [`src/lib/auth.ts`](src/lib/auth.ts) with a real provider
> (Auth.js, Clerk). Nothing else depends on it: the rest of the app only calls `getCurrentUserId()`.

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
    page.tsx              watch page
    history/page.tsx      per-video history
    privacy/page.tsx      disclosure + delete controls
    api/                  auth · session · events · stats · history · search · account
  components/
    YouTubePlayer.tsx     IFrame Player API wrapper
    WatchDashboard.tsx    watch page composition
    LiveSession.tsx       live per-video readout
    StatCards.tsx         today's numbers + learning report
    WeeklyChart.tsx       Recharts weekly bars
    HistoryTable.tsx      responsive table / cards
    VideoInput.tsx        URL parsing + optional search
    Nav · CategoryBadge · TrackingNotice · DataControls · SignInCard · SetupNotice
  hooks/
    useWatchTracker.ts    player → events: seek detection, heartbeat, visibility
  lib/
    watch-time.ts         ★ the algorithm
    intervals.ts          merge / union / clamp
    analytics.ts          event log → daily, weekly, history
    tracker.ts            batching, retry, sendBeacon
    classify.ts           STUDY / ENTERTAINMENT / OTHER (pluggable)
    youtube.ts            URL parsing + IFrame API loader
    youtube-meta.ts       oEmbed fallback for title/channel
    db · auth · dates · format · types
tests/
  watch-time.test.ts      19 tests, including the exact example from the brief
  classify.test.ts        6 tests
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

- **Sign-in has no password** (see Privacy above).
- **Search needs an API key.** Pasting links always works.
- **Some videos disallow embedding**; the player shows a clear message when that happens.
- **Analytics are computed per request** from the raw event log. That is fast for normal use (a
  week is tens of sessions); a very heavy user would eventually want a materialised
  `session_stats` table. The module shape would not change.
- **Background-tab audio is not counted** as watch time. Flip `COUNT_HIDDEN_TAB_TIME` in
  `src/lib/watch-time.ts` if you disagree.
