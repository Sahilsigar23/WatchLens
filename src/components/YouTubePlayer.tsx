'use client';

import { useEffect, useRef, useState } from 'react';

import { PLAYER_PREFS_KEY } from '@/lib/player-state';
import { loadYouTubeApi, type PlayerSource, type YouTubePlayer as Player } from '@/lib/youtube';

/** Reported alongside a video change so callers can keep their index in step. */
export interface VideoChange {
  videoId: string;
  /** Index within the playlist, or -1 when not playing a playlist. */
  playlistIndex: number;
}

interface YouTubePlayerProps {
  source: PlayerSource;
  /**
   * Position to open the very first video at, used to recover from a hard
   * reload. Read once at construction; later changes are ignored, because
   * moving the playhead out from under someone mid-video is not a restore.
   */
  initialStartSeconds?: number;
  onReady: (player: Player) => void;
  onStateChange: (state: number) => void;
  onVideoChange: (change: VideoChange) => void;
}

/**
 * Volume and speed survive a hard reload; the player object cannot.
 * The key is imported rather than repeated so it cannot drift from the copy
 * that `clearPlayerState` erases — which is exactly what a rename would do.
 */
const PREFS_KEY = PLAYER_PREFS_KEY;

interface PlayerPrefs {
  volume?: number;
  muted?: boolean;
  rate?: number;
}

function readPrefs(): PlayerPrefs {
  try {
    return JSON.parse(localStorage.getItem(PREFS_KEY) ?? '{}') as PlayerPrefs;
  } catch {
    return {};
  }
}

function writePrefs(prefs: PlayerPrefs): void {
  try {
    localStorage.setItem(PREFS_KEY, JSON.stringify(prefs));
  } catch {
    // Private mode or a full quota. Preferences are a nicety, never a blocker.
  }
}

/**
 * Wrapper around the official YouTube IFrame Player API.
 *
 * The player is created **once** and lives for the whole session. Changing
 * video or playlist goes through `loadVideoById` / `cuePlaylist` /
 * `playVideoAt`, never a remount — recreating the iframe would restart
 * playback, drop volume and speed, and cost a fresh connection to YouTube's
 * CDN. Mounting this component inside the root layout (see PlayerShell) is what
 * keeps that true across client-side navigation.
 *
 * Video bytes go straight from YouTube to the browser; the server sees only the
 * events reported from here.
 */
export function YouTubePlayer({
  source,
  initialStartSeconds,
  onReady,
  onStateChange,
  onVideoChange,
}: YouTubePlayerProps) {
  const hostRef = useRef<HTMLDivElement>(null);
  const playerRef = useRef<Player | null>(null);
  const [status, setStatus] = useState<'loading' | 'ready' | 'error'>('loading');

  /**
   * `requested*` is what we last asked the player for; `loadedVideoId` is what
   * the player says it is showing. Keeping them apart is what stops a feedback
   * loop: when the playlist auto-advances, we sync `requested` to the player's
   * own index so the source effect sees nothing to do and does not "correct"
   * the player back to the start of the video it just moved on to.
   */
  const requestedVideoIdRef = useRef<string | null>(null);
  const requestedPlaylistIdRef = useRef<string | null>(null);
  const requestedIndexRef = useRef<number>(-1);
  const loadedVideoIdRef = useRef<string | null>(null);

  const callbacks = useRef({ onReady, onStateChange, onVideoChange });
  callbacks.current = { onReady, onStateChange, onVideoChange };

  const initialSource = useRef(source);
  const initialStart = useRef(initialStartSeconds);

  useEffect(() => {
    let cancelled = false;

    loadYouTubeApi()
      .then((YT) => {
        if (cancelled || !hostRef.current) return;

        const start = initialSource.current;
        const playerVars: Record<string, unknown> = {
          // Native controls: play/pause, seek, volume, speed, captions,
          // quality and fullscreen all behave the way YouTube's own do.
          controls: 1,
          rel: 0,
          modestbranding: 1,
          playsinline: 1,
          origin: window.location.origin,
        };

        // `start` reopens the video where a previous visit left it. Autoplay is
        // deliberately not set, so a restored player waits for the user.
        if (initialStart.current && initialStart.current > 0) {
          playerVars.start = Math.floor(initialStart.current);
        }

        // The `videoId` key must be absent (not undefined) for a playlist embed:
        // the IFrame API branches on its presence, and passing it as undefined
        // produces an iframe with no src at all.
        const options: Record<string, unknown> = { playerVars };

        if (start.kind === 'playlist') {
          playerVars.list = start.playlistId;
          playerVars.listType = 'playlist';
          requestedPlaylistIdRef.current = start.playlistId;
          requestedIndexRef.current = start.index;
        } else {
          options.videoId = start.videoId;
          requestedVideoIdRef.current = start.videoId;
          loadedVideoIdRef.current = start.videoId;
        }

        options.events = {
            onReady: (event: { target: Player }) => {
              if (cancelled) return;
              setStatus('ready');

              // `index` is not a valid embed parameter — only cuePlaylist takes
              // one — so a non-zero starting index is applied here instead.
              if (start.kind === 'playlist' && start.index > 0) {
                try {
                  event.target.cuePlaylist({
                    list: start.playlistId,
                    listType: 'playlist',
                    index: start.index,
                    // Re-cueing discards the `start` player var, so the restored
                    // position has to be handed over here as well.
                    startSeconds: initialStart.current ?? 0,
                  });
                } catch {
                  // Fall back to whatever the embed already cued.
                }
              }

              // Restore volume/speed from the last visit. Within a visit the
              // player is never rebuilt, so this only matters after a reload.
              const prefs = readPrefs();
              try {
                if (typeof prefs.volume === 'number') event.target.setVolume(prefs.volume);
                if (prefs.muted) event.target.mute();
                if (typeof prefs.rate === 'number') event.target.setPlaybackRate(prefs.rate);
              } catch {
                // An older embed may not expose all of these.
              }

              callbacks.current.onReady(event.target);
            },
            onStateChange: (event: { data: number; target: Player }) => {
              if (cancelled) return;

              // One place detects every video change: the user picking from the
              // sidebar, prev/next, the playlist auto-advancing at the end, or
              // an end-screen click inside the player itself.
              const actual = event.target.getVideoData?.()?.video_id;
              if (actual && actual !== loadedVideoIdRef.current) {
                const index = event.target.getPlaylistIndex?.() ?? -1;
                loadedVideoIdRef.current = actual;
                requestedVideoIdRef.current = actual;
                requestedIndexRef.current = index;
                callbacks.current.onVideoChange({ videoId: actual, playlistIndex: index });
              }
              callbacks.current.onStateChange(event.data);
            },
            onPlaybackRateChange: (event: { data: number }) => {
              writePrefs({ ...readPrefs(), rate: event.data });
            },
            onError: () => {
              if (!cancelled) setStatus('error');
            },
        };

        playerRef.current = new YT.Player(hostRef.current, options);
      })
      .catch(() => {
        if (!cancelled) setStatus('error');
      });

    return () => {
      cancelled = true;
      playerRef.current?.destroy();
      playerRef.current = null;
    };
  }, []);

  // Apply source changes in place.
  useEffect(() => {
    const player = playerRef.current;
    if (!player || status !== 'ready') return;

    if (source.kind === 'playlist') {
      if (requestedPlaylistIdRef.current !== source.playlistId) {
        requestedPlaylistIdRef.current = source.playlistId;
        requestedIndexRef.current = source.index;
        // Cue rather than load: opening a playlist should not start playing on
        // its own, especially when we are restoring one from a previous visit.
        player.cuePlaylist({
          list: source.playlistId,
          listType: 'playlist',
          index: source.index,
        });
      } else if (requestedIndexRef.current !== source.index) {
        requestedIndexRef.current = source.index;
        player.playVideoAt(source.index);
      }
      return;
    }

    requestedPlaylistIdRef.current = null;
    if (requestedVideoIdRef.current !== source.videoId) {
      requestedVideoIdRef.current = source.videoId;
      player.loadVideoById({ videoId: source.videoId });
    }
  }, [source, status]);

  // Persist volume/mute periodically — the API has no volume-change event.
  useEffect(() => {
    const interval = setInterval(() => {
      const player = playerRef.current;
      if (!player || typeof player.getVolume !== 'function') return;
      try {
        writePrefs({ ...readPrefs(), volume: player.getVolume(), muted: player.isMuted() });
      } catch {
        // Ignore: preferences are best-effort.
      }
    }, 5000);

    return () => clearInterval(interval);
  }, []);

  return (
    <div className="relative w-full overflow-hidden rounded-xl bg-black shadow-lg">
      {/* 16:9 box so the player is responsive without layout shift. */}
      <div className="relative w-full pt-[56.25%]">
        <div ref={hostRef} className="absolute inset-0 h-full w-full" />

        {status === 'loading' && (
          <div className="absolute inset-0 flex items-center justify-center bg-neutral-900">
            <div className="flex flex-col items-center gap-3 text-neutral-400">
              <div className="h-8 w-8 animate-spin rounded-full border-2 border-neutral-600 border-t-red-500" />
              <p className="text-sm">Loading player…</p>
            </div>
          </div>
        )}

        {status === 'error' && (
          <div className="absolute inset-0 flex items-center justify-center bg-neutral-900 px-6 text-center">
            <p className="text-sm text-neutral-300">
              This video could not be played here. The owner may have disabled embedding —
              try a different video.
            </p>
          </div>
        )}
      </div>
    </div>
  );
}
