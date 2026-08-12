/**
 * YouTube helpers: URL parsing and a single shared loader for the IFrame
 * Player API.
 *
 * Nothing here touches video bytes. The IFrame embed talks to youtube.com
 * directly from the browser; WatchLens only ever sees player *events*.
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

/**
 * Pulls a playlist id out of a URL.
 *
 * Returns null for the `RD…`/`RDMM…` auto-generated mixes: YouTube refuses to
 * embed those and they have no fixed item list, so treating them as playlists
 * would produce an empty sidebar and a dead player.
 */
export function parsePlaylistId(input: string): string | null {
  const trimmed = input.trim();
  if (!trimmed) return null;

  const isUsable = (id: string) => /^[\w-]{12,64}$/.test(id) && !/^RD/.test(id);

  if (isUsable(trimmed) && /^(PL|UU|LL|FL|OL)/.test(trimmed)) return trimmed;

  try {
    const url = new URL(trimmed.startsWith('http') ? trimmed : `https://${trimmed}`);
    const host = url.hostname.replace(/^www\./, '');
    if (!/^(m\.|music\.)?youtube\.com$|^youtu\.be$/.test(host)) return null;

    const list = url.searchParams.get('list');
    return list && isUsable(list) ? list : null;
  } catch {
    return null;
  }
}

/** What the player should be showing. */
export type PlayerSource =
  | { kind: 'video'; videoId: string }
  | { kind: 'playlist'; playlistId: string; index: number };

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
  setPlaybackRate(rate: number): void;
  getVideoData(): { video_id: string; title: string; author: string };
  destroy(): void;

  // Playlist controls. `cuePlaylist` loads without autoplaying, which is what
  // we want when restoring a playlist the user has not asked to resume yet.
  cuePlaylist(options: { list: string; listType: string; index?: number; startSeconds?: number }): void;
  loadPlaylist(options: { list: string; listType: string; index?: number; startSeconds?: number }): void;
  /** Video ids in playlist order. Empty until the playlist has loaded. */
  getPlaylist(): string[] | null;
  getPlaylistIndex(): number;
  playVideoAt(index: number): void;
  nextVideo(): void;
  previousVideo(): void;

  // Volume and mute, so they can be carried across a forced player rebuild.
  getVolume(): number;
  setVolume(volume: number): void;
  isMuted(): boolean;
  mute(): void;
  unMute(): void;
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
