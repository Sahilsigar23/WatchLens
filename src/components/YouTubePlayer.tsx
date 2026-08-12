'use client';

import { useEffect, useRef, useState } from 'react';

import { loadYouTubeApi, type YouTubePlayer as Player } from '@/lib/youtube';

interface YouTubePlayerProps {
  videoId: string;
  /** Seconds to resume from, applied only when the video first loads. */
  startSeconds?: number;
  onReady: (player: Player) => void;
  onStateChange: (state: number) => void;
  /** Fired when the user switches to a different video in the same player. */
  onVideoChange: (videoId: string) => void;
}

/**
 * Thin wrapper around the official YouTube IFrame Player API.
 *
 * The player is created once and kept for the life of the page. Changing
 * `videoId` calls `loadVideoById` rather than remounting the iframe, so
 * switching videos never reloads the page or throws away YouTube's warm
 * connection to its CDN.
 *
 * The video stream goes straight from YouTube to the browser. StudyTrace's
 * server sees only the events this component reports.
 */
export function YouTubePlayer({
  videoId,
  startSeconds,
  onReady,
  onStateChange,
  onVideoChange,
}: YouTubePlayerProps) {
  const hostRef = useRef<HTMLDivElement>(null);
  const playerRef = useRef<Player | null>(null);
  /** What we last asked the player to load — stops duplicate loadVideoById calls. */
  const requestedVideoIdRef = useRef<string | null>(null);
  /** What the player reports it is actually showing — drives onVideoChange. */
  const loadedVideoIdRef = useRef<string | null>(null);
  const [status, setStatus] = useState<'loading' | 'ready' | 'error'>('loading');

  // Callbacks live in refs so the player is never rebuilt just because a parent
  // re-render produced new function identities.
  const callbacks = useRef({ onReady, onStateChange, onVideoChange });
  callbacks.current = { onReady, onStateChange, onVideoChange };

  const initialVideoId = useRef(videoId);
  const initialStart = useRef(startSeconds);

  useEffect(() => {
    let cancelled = false;

    loadYouTubeApi()
      .then((YT) => {
        if (cancelled || !hostRef.current) return;

        playerRef.current = new YT.Player(hostRef.current, {
          videoId: initialVideoId.current,
          playerVars: {
            // Native controls give the user play/pause, seek, volume, speed,
            // captions and fullscreen — the normal YouTube experience.
            controls: 1,
            rel: 0,
            modestbranding: 1,
            playsinline: 1,
            origin: window.location.origin,
            start: initialStart.current ? Math.floor(initialStart.current) : undefined,
          },
          events: {
            onReady: (event: { target: Player }) => {
              if (cancelled) return;
              loadedVideoIdRef.current = initialVideoId.current;
              requestedVideoIdRef.current = initialVideoId.current;
              setStatus('ready');
              callbacks.current.onReady(event.target);
            },
            onStateChange: (event: { data: number; target: Player }) => {
              if (cancelled) return;

              // The player reports the id it is actually showing. Any change —
              // the user picking a new video above, or an end-screen click
              // inside the player — surfaces here, so tracking switches
              // sessions from one place rather than two.
              const actual = event.target.getVideoData?.()?.video_id;
              if (actual && actual !== loadedVideoIdRef.current) {
                loadedVideoIdRef.current = actual;
                requestedVideoIdRef.current = actual;
                callbacks.current.onVideoChange(actual);
              }
              callbacks.current.onStateChange(event.data);
            },
            onError: () => {
              if (!cancelled) setStatus('error');
            },
          },
        });
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

  // Switch videos in place — no remount, no page reload.
  useEffect(() => {
    const player = playerRef.current;
    if (!player || status !== 'ready') return;
    if (requestedVideoIdRef.current === videoId) return;

    // Only `requested` is updated here. `loaded` stays behind until the player
    // confirms the switch, which is what lets onStateChange raise onVideoChange
    // with metadata that actually belongs to the new video.
    requestedVideoIdRef.current = videoId;
    player.loadVideoById({
      videoId,
      startSeconds: startSeconds ? Math.floor(startSeconds) : undefined,
    });
  }, [videoId, startSeconds, status]);

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
