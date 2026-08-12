import { fetchVideoMeta } from './youtube-meta';

/**
 * Playlist metadata: titles, channels and durations for the sidebar.
 *
 * Two paths, because durations are the awkward part:
 *
 *  - With `YOUTUBE_API_KEY` we ask the Data API and get everything in two
 *    calls per 50 videos, durations included.
 *  - Without a key we fall back to the ids the IFrame player itself reports
 *    plus one oEmbed lookup per video for the title and channel. oEmbed does
 *    not expose duration, so unknown durations stay 0 and fill themselves in
 *    as the user plays each video (the player reports the duration then, and
 *    /api/session stores it).
 *
 * Either way this is metadata only — a few KB of JSON. Video bytes never touch
 * the server.
 */

const TIMEOUT_MS = 6000;

/** Data API caps every list endpoint at 50 ids per request. */
const API_PAGE_SIZE = 50;

/** Ceiling on playlist size, to bound both request count and page weight. */
export const MAX_PLAYLIST_ITEMS = 200;

/** How many oEmbed lookups to run at once on the keyless path. */
const OEMBED_CONCURRENCY = 8;

export interface ItemMeta {
  youtubeVideoId: string;
  title: string;
  channelName: string;
  durationSeconds: number;
}

/** `PT1H2M3S` -> `3723`. Returns 0 for anything unparseable (e.g. `P0D` live). */
export function parseIsoDuration(iso: string): number {
  const match = /^P(?:\d+D)?T(?:(\d+)H)?(?:(\d+)M)?(?:(\d+)S)?$/.exec(iso ?? '');
  if (!match) return 0;
  const [, h, m, s] = match;
  return Number(h ?? 0) * 3600 + Number(m ?? 0) * 60 + Number(s ?? 0);
}

async function getJson<T>(url: URL): Promise<T | null> {
  try {
    const response = await fetch(url, {
      signal: AbortSignal.timeout(TIMEOUT_MS),
      next: { revalidate: 3600 },
    });
    return response.ok ? ((await response.json()) as T) : null;
  } catch {
    return null;
  }
}

/** Playlist title via oEmbed — no API key needed. */
export async function fetchPlaylistTitle(playlistId: string): Promise<string> {
  const url = new URL('https://www.youtube.com/oembed');
  url.searchParams.set('url', `https://www.youtube.com/playlist?list=${playlistId}`);
  url.searchParams.set('format', 'json');

  const data = await getJson<{ title?: string }>(url);
  return String(data?.title ?? '');
}

interface PlaylistItemsResponse {
  items?: {
    snippet?: {
      title?: string;
      videoOwnerChannelTitle?: string;
      channelTitle?: string;
      resourceId?: { videoId?: string };
    };
  }[];
  nextPageToken?: string;
}

/**
 * Full ordered item list from the Data API, following pagination.
 * Returns null when there is no key or the call fails, so the caller falls back.
 */
async function fetchItemsViaApi(playlistId: string, key: string): Promise<ItemMeta[] | null> {
  const items: ItemMeta[] = [];
  let pageToken: string | undefined;

  do {
    const url = new URL('https://www.googleapis.com/youtube/v3/playlistItems');
    url.searchParams.set('part', 'snippet');
    url.searchParams.set('playlistId', playlistId);
    url.searchParams.set('maxResults', String(API_PAGE_SIZE));
    url.searchParams.set('key', key);
    if (pageToken) url.searchParams.set('pageToken', pageToken);

    const data = await getJson<PlaylistItemsResponse>(url);
    if (!data) return items.length > 0 ? items : null;

    for (const item of data.items ?? []) {
      const videoId = item.snippet?.resourceId?.videoId;
      if (!videoId) continue;
      items.push({
        youtubeVideoId: videoId,
        title: String(item.snippet?.title ?? ''),
        channelName: String(
          item.snippet?.videoOwnerChannelTitle ?? item.snippet?.channelTitle ?? '',
        ),
        durationSeconds: 0,
      });
    }

    pageToken = data.nextPageToken;
  } while (pageToken && items.length < MAX_PLAYLIST_ITEMS);

  return items.slice(0, MAX_PLAYLIST_ITEMS);
}

/** Fills in durations for ids we already have, 50 at a time. */
async function applyDurationsViaApi(items: ItemMeta[], key: string): Promise<void> {
  const byId = new Map(items.map((item) => [item.youtubeVideoId, item]));

  for (let offset = 0; offset < items.length; offset += API_PAGE_SIZE) {
    const page = items.slice(offset, offset + API_PAGE_SIZE);

    const url = new URL('https://www.googleapis.com/youtube/v3/videos');
    url.searchParams.set('part', 'contentDetails');
    url.searchParams.set('id', page.map((item) => item.youtubeVideoId).join(','));
    url.searchParams.set('key', key);

    const data = await getJson<{
      items?: { id?: string; contentDetails?: { duration?: string } }[];
    }>(url);
    if (!data) continue;

    for (const entry of data.items ?? []) {
      const target = entry.id ? byId.get(entry.id) : undefined;
      if (target) target.durationSeconds = parseIsoDuration(entry.contentDetails?.duration ?? '');
    }
  }
}

/** oEmbed lookups for the keyless path, run in small concurrent batches. */
async function fetchItemsViaOEmbed(videoIds: string[]): Promise<ItemMeta[]> {
  const results: ItemMeta[] = [];

  for (let offset = 0; offset < videoIds.length; offset += OEMBED_CONCURRENCY) {
    const batch = videoIds.slice(offset, offset + OEMBED_CONCURRENCY);
    const metas = await Promise.all(batch.map((id) => fetchVideoMeta(id)));

    batch.forEach((youtubeVideoId, i) => {
      results.push({
        youtubeVideoId,
        title: metas[i]?.title ?? '',
        channelName: metas[i]?.channelName ?? '',
        durationSeconds: 0,
      });
    });
  }

  return results;
}

/**
 * Ordered playlist contents.
 *
 * `playerVideoIds` are the ids the browser's player reported. They are the
 * authority on ordering when there is no API key, and the reason a playlist
 * works at all without one.
 */
export async function fetchPlaylistItems(
  playlistId: string,
  playerVideoIds: string[],
): Promise<ItemMeta[]> {
  const key = process.env.YOUTUBE_API_KEY;

  if (key) {
    const items = await fetchItemsViaApi(playlistId, key);
    if (items && items.length > 0) {
      await applyDurationsViaApi(items, key);
      return items;
    }
    // Fall through: a private or quota-exhausted response should still leave a
    // usable sidebar built from what the player told us.
  }

  const ids = playerVideoIds.filter((id) => /^[\w-]{11}$/.test(id)).slice(0, MAX_PLAYLIST_ITEMS);
  return ids.length > 0 ? fetchItemsViaOEmbed(ids) : [];
}
