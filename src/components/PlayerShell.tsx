'use client';

import { usePathname, useRouter } from 'next/navigation';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';

import type { PlayerRequest } from '@/components/AppShell';
import { Icon } from '@/components/Icon';
import { NowPlaying } from '@/components/NowPlaying';
import { PlaylistSidebar } from '@/components/PlaylistSidebar';
import { VideoInput } from '@/components/VideoInput';
import { WatchEmptyState } from '@/components/WatchEmptyState';
import { YouTubePlayer, type VideoChange } from '@/components/YouTubePlayer';
import { useWatchTracker } from '@/hooks/useWatchTracker';
import { readPlayerState, writePlayerState, type StoredPlayerState } from '@/lib/player-state';
import type { PlaylistSummary, ResumePoint } from '@/lib/types';
import type { PlayerSource, YouTubePlayer as Player } from '@/lib/youtube';

/**
 * The persistent player.
 *
 * This component is mounted by the root layout, so it survives every
 * client-side navigation: going to History and back does not unmount the
 * player, does not recreate the iframe, and therefore cannot lose the playback
 * position, the playlist, the volume, the speed or the watch session. On the
 * Watch route it lays out in flow; everywhere else the *same DOM node* is
 * restyled into a corner mini-player. Nothing is re-parented, because moving an
 * iframe in the DOM would reload it and restart the video.
 *
 * A hard reload is the one case the player genuinely cannot survive. For that,
 * the selected video, playlist, index and position are mirrored to
 * localStorage and restored on the next mount.
 */

/** How often the current position is mirrored for hard-reload recovery. */
const POSITION_SAVE_MS = 5000;

/** Polling for the player's playlist contents after a playlist is cued. */
const PLAYLIST_POLL_MS = 300;
const PLAYLIST_POLL_ATTEMPTS = 25;

interface ShellState {
  videoId: string | null;
  playlistId: string | null;
  playlistIndex: number;
}

const EMPTY_STATE: ShellState = { videoId: null, playlistId: null, playlistIndex: 0 };

export function PlayerShell({
  onSessionChange,
  request,
}: {
  onSessionChange?: () => void;
  request?: PlayerRequest | null;
}) {
  const pathname = usePathname();
  const router = useRouter();
  /** Full size on the Watch page; a corner mini-player in every other section. */
  const expanded = pathname === '/';

  const [state, setState] = useState<ShellState>(EMPTY_STATE);
  const [playlist, setPlaylist] = useState<PlaylistSummary | null>(null);
  const [playlistError, setPlaylistError] = useState<string | null>(null);
  const [restoredPosition, setRestoredPosition] = useState<number | null>(null);
  const [hydrated, setHydrated] = useState(false);

  const playerRef = useRef<Player | null>(null);
  /** True once the user has actually played something this visit. */
  const hasPlayedRef = useRef(false);
  /** Guards the one-shot jump to the server's resume index. */
  const appliedResumeRef = useRef<string | null>(null);
  /** Latest state for callbacks that must not re-subscribe when it changes. */
  const stateRef = useRef(state);
  stateRef.current = state;

  const handleSessionChange = useCallback(() => {
    onSessionChange?.();
  }, [onSessionChange]);

  const tracker = useWatchTracker(state.playlistId, handleSessionChange);
  const { handlePlayerReady, handleStateChange, handleVideoChange } = tracker;

  // --- Restore after a hard reload -----------------------------------------

  useEffect(() => {
    let cancelled = false;

    const stored = readPlayerState();
    if (stored) {
      setState({
        videoId: stored.videoId,
        playlistId: stored.playlistId,
        playlistIndex: stored.playlistIndex ?? 0,
      });
      // Applied as the player's `start` parameter at construction, so the video
      // opens where it was left instead of at 0:00.
      setRestoredPosition(stored.position && stored.position > 5 ? stored.position : null);
      setHydrated(true);
      return;
    }

    // Nothing in this browser — a new device, a cleared browser, or a fresh
    // login. Ask the server where the *account* left off. This is the reason
    // localStorage is only ever a cache: the database is the source of truth.
    fetch('/api/user/progress')
      .then((response) => (response.ok ? response.json() : null))
      .then((data: { resume?: ResumePoint | null } | null) => {
        if (cancelled || !data?.resume) return;
        const resume = data.resume;

        setState({
          videoId: resume.youtubePlaylistId ? null : resume.youtubeVideoId,
          playlistId: resume.youtubePlaylistId,
          playlistIndex: resume.playlistIndex ?? 0,
        });
        setRestoredPosition(resume.positionSeconds > 5 ? resume.positionSeconds : null);
      })
      .catch(() => {
        // Offline or the API is down — the app still works, it just opens empty.
      })
      .finally(() => {
        if (!cancelled) setHydrated(true);
      });

    return () => {
      cancelled = true;
    };
  }, []);

  const persist = useCallback((next: ShellState, position?: number) => {
    const payload: StoredPlayerState = { ...next };
    if (typeof position === 'number' && Number.isFinite(position)) payload.position = position;
    writePlayerState(payload);
  }, []);

  useEffect(() => {
    if (!hydrated) return;
    if (!state.videoId && !state.playlistId) return;
    persist(state, playerRef.current?.getCurrentTime?.());
  }, [state, hydrated, persist]);

  // Mirror the position so a reload can resume. Cheap: one property read.
  useEffect(() => {
    const interval = setInterval(() => {
      const player = playerRef.current;
      if (!player || typeof player.getCurrentTime !== 'function') return;
      const stateNow = stateRef.current;
      if (!stateNow.videoId && !stateNow.playlistId) return;
      persist(stateNow, player.getCurrentTime());
    }, POSITION_SAVE_MS);

    return () => clearInterval(interval);
  }, [persist]);

  // --- Selection ------------------------------------------------------------

  const selectVideo = useCallback((videoId: string) => {
    setRestoredPosition(null);
    setState({ videoId, playlistId: null, playlistIndex: 0 });
    setPlaylist(null);
    setPlaylistError(null);
  }, []);

  const selectPlaylist = useCallback((playlistId: string) => {
    setRestoredPosition(null);
    setPlaylist(null);
    setPlaylistError(null);
    appliedResumeRef.current = null;
    setState({ videoId: null, playlistId, playlistIndex: 0 });
  }, []);

  /**
   * Changing the index is all it takes to change video: the source effect in
   * YouTubePlayer turns it into `playVideoAt`, and the player's own report of
   * the change flows back through `handleVideoChange`. One direction of data
   * flow, so a user click and an auto-advance take exactly the same path.
   */
  const selectIndex = useCallback((index: number) => {
    setState((current) => {
      if (index < 0 || index === current.playlistIndex) return current;
      return { ...current, playlistIndex: index };
    });
  }, []);

  const goPrevious = useCallback(() => {
    setState((current) => ({
      ...current,
      playlistIndex: Math.max(0, current.playlistIndex - 1),
    }));
  }, []);

  const goNext = useCallback(() => {
    setState((current) => ({ ...current, playlistIndex: current.playlistIndex + 1 }));
  }, []);

  const onPlayerReady = useCallback(
    (player: Player) => {
      playerRef.current = player;
      handlePlayerReady(player);
    },
    [handlePlayerReady],
  );

  const onVideoChange = useCallback(
    (change: VideoChange) => {
      hasPlayedRef.current = true;
      // Keep our index in step with the player's — this is what makes the
      // playlist auto-advancing at the end of a video update the sidebar.
      if (change.playlistIndex >= 0) {
        setState((current) =>
          current.playlistIndex === change.playlistIndex
            ? current
            : { ...current, playlistIndex: change.playlistIndex },
        );
      }
      handleVideoChange(change);
    },
    [handleVideoChange],
  );

  const onStateChange = useCallback(
    (playerState: number) => {
      if (playerState === 1) hasPlayedRef.current = true;
      handleStateChange(playerState);
    },
    [handleStateChange],
  );

  // --- Playlist contents ----------------------------------------------------

  const fetchPlaylist = useCallback(async (playlistId: string, videoIds: string[]) => {
    const response = await fetch('/api/playlist', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ youtubePlaylistId: playlistId, videoIds }),
    });
    if (!response.ok) {
      const data = (await response.json().catch(() => ({}))) as { error?: string };
      throw new Error(data.error ?? 'Could not load the playlist.');
    }
    return (await response.json()) as PlaylistSummary;
  }, []);

  // The player is the authority on a playlist's contents and order, which is
  // what lets playlists work with no YouTube Data API key. Poll until it has
  // them, then hand them to the server for metadata and progress.
  useEffect(() => {
    const playlistId = state.playlistId;
    if (!playlistId) return;

    let cancelled = false;
    let attempts = 0;

    const timer = setInterval(() => {
      attempts += 1;
      const ids = playerRef.current?.getPlaylist?.() ?? null;
      const ready = Array.isArray(ids) && ids.length > 0;
      if (!ready && attempts < PLAYLIST_POLL_ATTEMPTS) return;

      clearInterval(timer);
      fetchPlaylist(playlistId, ids ?? [])
        .then((summary) => {
          if (cancelled) return;
          setPlaylist(summary);
          setPlaylistError(null);
        })
        .catch((error: Error) => {
          if (!cancelled) setPlaylistError(error.message);
        });
    }, PLAYLIST_POLL_MS);

    return () => {
      cancelled = true;
      clearInterval(timer);
    };
  }, [state.playlistId, fetchPlaylist]);

  // Refresh progress when a session opens, so sidebar percentages keep up.
  const refreshPlaylist = useCallback(() => {
    const playlistId = stateRef.current.playlistId;
    if (!playlistId) return;
    const ids = playerRef.current?.getPlaylist?.() ?? [];
    fetchPlaylist(playlistId, ids ?? [])
      .then((summary) => setPlaylist(summary))
      .catch(() => {
        // Stale percentages are fine; nothing about playback depends on them.
      });
  }, [fetchPlaylist]);

  // Re-read progress shortly after each video change, once the outgoing
  // session's events have had time to flush. `refreshPlaylist` no-ops when no
  // playlist is open, so this is free for standalone videos.
  useEffect(() => {
    const timer = setTimeout(refreshPlaylist, 1500);
    return () => clearTimeout(timer);
  }, [state.videoId, state.playlistIndex, refreshPlaylist]);

  /**
   * Load whatever another section asked for — the Playlists page opening a
   * course, for instance. Keyed on the request's nonce rather than its id so
   * re-opening the same playlist still registers.
   */
  const lastRequestRef = useRef<number>(0);
  useEffect(() => {
    if (!request || request.nonce === lastRequestRef.current) return;
    lastRequestRef.current = request.nonce;

    if (request.kind === 'playlist') {
      if (stateRef.current.playlistId !== request.id) selectPlaylist(request.id);
    } else if (stateRef.current.videoId !== request.id) {
      selectVideo(request.id);
    }
  }, [request, selectPlaylist, selectVideo]);

  /**
   * Jump to where the user stopped in this playlist. Only ever applied before
   * they have played anything, so it can never yank the playhead mid-video.
   */
  useEffect(() => {
    if (!playlist || hasPlayedRef.current) return;
    if (appliedResumeRef.current === playlist.youtubePlaylistId) return;
    appliedResumeRef.current = playlist.youtubePlaylistId;

    const resume = playlist.resumeIndex;
    if (resume !== null && resume >= 0 && resume !== stateRef.current.playlistIndex) {
      setState((current) => ({ ...current, playlistIndex: resume }));
    }
  }, [playlist]);

  // --- Render ---------------------------------------------------------------

  const source: PlayerSource | null = useMemo(() => {
    if (state.playlistId) {
      return { kind: 'playlist', playlistId: state.playlistId, index: state.playlistIndex };
    }
    if (state.videoId) return { kind: 'video', videoId: state.videoId };
    return null;
  }, [state.playlistId, state.playlistIndex, state.videoId]);

  // Once the player exists it must never unmount, or the iframe is destroyed
  // and everything this component is for is lost.
  const [playerMounted, setPlayerMounted] = useState(false);
  useEffect(() => {
    if (source) setPlayerMounted(true);
  }, [source]);

  const currentItem = playlist?.items[state.playlistIndex] ?? null;

  // The player reports metadata for whatever is on screen; the playlist row is
  // the fallback while it is still resolving, so the title does not flicker.
  const title = tracker.videoMeta?.title || currentItem?.title || '';
  const channelName = tracker.videoMeta?.channelName || currentItem?.channelName || '';

  if (!hydrated) return null;

  return (
    <div
      className={
        expanded
          ? 'mb-6 space-y-4'
          : 'fixed bottom-20 right-3 z-30 w-60 space-y-2 rounded-2xl border border-line bg-surface/95 p-2 shadow-2xl backdrop-blur-xl sm:w-72 md:bottom-4'
      }
    >
      {/* Compact search sits above the player; the empty state carries its own,
          larger one so it reads as the hero of the page. */}
      {expanded && playerMounted && source && (
        <VideoInput onSelectVideo={selectVideo} onSelectPlaylist={selectPlaylist} />
      )}

      {playerMounted && source ? (
        <div className={expanded ? 'grid gap-4 lg:grid-cols-3' : ''}>
          {/*
            This wrapper's position among its siblings never changes, so React
            keeps the same DOM node and the iframe is never re-parented.
          */}
          {/*
            `min-w-0` is required: a grid item defaults to `min-width: auto`, so
            without it the column is sized by its content's min-content width
            and the whole page scrolls sideways on a phone.
          */}
          <div className={expanded ? 'min-w-0 space-y-4 lg:col-span-2' : ''}>
            <YouTubePlayer
              source={source}
              initialStartSeconds={restoredPosition ?? undefined}
              onReady={onPlayerReady}
              onStateChange={onStateChange}
              onVideoChange={onVideoChange}
            />

            {expanded && (
              <NowPlaying
                title={title}
                channelName={channelName}
                stats={tracker.liveStats}
                saving={tracker.saving}
                onResume={tracker.resume}
                resumePosition={tracker.resumePosition}
              />
            )}
          </div>

          {expanded && playlist && (
            <div className="min-w-0 space-y-4">
              <PlaylistSidebar
                playlist={playlist}
                currentIndex={state.playlistIndex}
                onSelect={selectIndex}
                onPrevious={goPrevious}
                onNext={goNext}
              />
            </div>
          )}
        </div>
      ) : (
        expanded && (
          <WatchEmptyState onSelectVideo={selectVideo} onSelectPlaylist={selectPlaylist} />
        )
      )}

      {expanded && playlistError && (
        <p className="card p-4 text-sm text-muted">{playlistError}</p>
      )}

      {/*
        The playlist's aggregate figures live on /playlists now — the Watch page
        keeps only what belongs to the video on screen. The sidebar still shows
        per-video progress, which is part of choosing what to watch next.
      */}

      {/* Mini-player caption doubles as the way back to the Watch page. */}
      {!expanded && playerMounted && (
        <button
          type="button"
          onClick={() => router.push('/')}
          className="flex w-full items-center justify-between gap-2 px-1 text-left"
        >
          <span className="min-w-0 flex-1 truncate text-xs text-muted">
            {title || 'Back to Watch'}
          </span>
          <span className="shrink-0 text-xs text-brand">Open ↗</span>
        </button>
      )}
    </div>
  );
}
