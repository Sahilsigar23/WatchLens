/**
 * Server-side metadata lookup via YouTube's public oEmbed endpoint.
 *
 * The IFrame player's `getVideoData()` is the primary source, but it often
 * returns an empty `author`, which would leave the Channel column blank. oEmbed
 * fills the gap: no API key, no quota, and it returns title and channel only.
 *
 * This fetches a few hundred bytes of JSON. No video data passes through the
 * server — that remains strictly browser-to-YouTube.
 */

export interface OEmbedMeta {
  title: string;
  channelName: string;
}

/** Give up quickly: metadata is nice to have, never worth delaying a session. */
const TIMEOUT_MS = 2500;

export async function fetchVideoMeta(youtubeVideoId: string): Promise<OEmbedMeta | null> {
  const url = new URL('https://www.youtube.com/oembed');
  url.searchParams.set('url', `https://www.youtube.com/watch?v=${youtubeVideoId}`);
  url.searchParams.set('format', 'json');

  try {
    const response = await fetch(url, {
      signal: AbortSignal.timeout(TIMEOUT_MS),
      // Titles do not change often; a day of caching keeps this off the hot path.
      next: { revalidate: 86_400 },
    });
    if (!response.ok) return null;

    const data = (await response.json()) as { title?: string; author_name?: string };
    return {
      title: String(data.title ?? ''),
      channelName: String(data.author_name ?? ''),
    };
  } catch {
    // Offline, rate-limited, or a private video. The player's own metadata
    // (possibly partial) is still used, and the session proceeds either way.
    return null;
  }
}
