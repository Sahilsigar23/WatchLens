/**
 * YouTube helpers: URL parsing and a single shared loader for the IFrame
 * Player API.
 *
 * Nothing here touches video bytes. The IFrame embed talks to youtube.com
 * directly from the browser; StudyTrace only ever sees player *events*.
 */

/**
 * Pulls the 11-character video id out of anything a user is likely to paste:
 * a watch URL, a share link, an embed URL, a Shorts link, or the bare id.
 * Returns null if there is no plausible id.
 */
export function parseVideoId(input: string): string | null {
  const trimmed = input.trim();
  if (!trimmed) return null;

  // A bare id.
  if (/^[\w-]{11}$/.test(trimmed)) return trimmed;

  let url: URL;
  try {
    url = new URL(trimmed.startsWith('http') ? trimmed : `https://${trimmed}`);
  } catch {
    return null;
  }

  const host = url.hostname.replace(/^www\./, '');

  if (host === 'youtu.be') {
    const id = url.pathname.slice(1);
    return /^[\w-]{11}$/.test(id) ? id : null;
  }

  if (host === 'youtube.com' || host === 'm.youtube.com' || host === 'music.youtube.com') {
    const fromQuery = url.searchParams.get('v');
    if (fromQuery && /^[\w-]{11}$/.test(fromQuery)) return fromQuery;

    // /embed/<id>, /shorts/<id>, /live/<id>, /v/<id>
    const match = url.pathname.match(/^\/(embed|shorts|live|v)\/([\w-]{11})/);
    if (match) return match[2];
  }

  return null;
}

/** YouTube's numeric player states, named. */
export const PlayerState = {
  UNSTARTED: -1,
  ENDED: 0,
  PLAYING: 1,
  PAUSED: 2,
  BUFFERING: 3,
  CUED: 5,
} as const;

/** The slice of the IFrame Player API this app uses. */
export interface YouTubePlayer {
  playVideo(): void;
  pauseVideo(): void;
  loadVideoById(options: { videoId: string; startSeconds?: number }): void;
  cueVideoById(options: { videoId: string; startSeconds?: number }): void;
  seekTo(seconds: number, allowSeekAhead: boolean): void;
  getCurrentTime(): number;
  getDuration(): number;
  getPlayerState(): number;
  getPlaybackRate(): number;
  getVideoData(): { video_id: string; title: string; author: string };
  destroy(): void;
}

interface YouTubeApi {
  Player: new (element: HTMLElement | string, options: unknown) => YouTubePlayer;
}

declare global {
  interface Window {
    YT?: YouTubeApi;
    onYouTubeIframeAPIReady?: () => void;
  }
}

let apiPromise: Promise<YouTubeApi> | null = null;

/**
 * Loads https://www.youtube.com/iframe_api once per page and resolves when the
 * global `YT` object is ready. Every caller shares the same promise, so mounting
 * several players (or React Strict Mode's double-mount) never injects the script
 * twice — a second injection would clobber `onYouTubeIframeAPIReady`.
 */
export function loadYouTubeApi(): Promise<YouTubeApi> {
  if (typeof window === 'undefined') {
    return Promise.reject(new Error('loadYouTubeApi must run in the browser'));
  }
  if (window.YT?.Player) return Promise.resolve(window.YT);
  if (apiPromise) return apiPromise;

  apiPromise = new Promise<YouTubeApi>((resolve, reject) => {
    const previousCallback = window.onYouTubeIframeAPIReady;

    window.onYouTubeIframeAPIReady = () => {
      previousCallback?.();
      if (window.YT?.Player) resolve(window.YT);
      else reject(new Error('YouTube IFrame API loaded without a Player'));
    };

    const script = document.createElement('script');
    script.src = 'https://www.youtube.com/iframe_api';
    script.async = true;
    script.onerror = () => {
      apiPromise = null; // let a later attempt retry
      reject(new Error('Failed to load the YouTube IFrame API'));
    };
    document.head.appendChild(script);
  });

  return apiPromise;
}
