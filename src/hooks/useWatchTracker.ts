'use client';

import { useCallback, useEffect, useRef, useState } from 'react';

import type { VideoChange } from '@/components/YouTubePlayer';
import { EventTracker } from '@/lib/tracker';
import type { EventType, Interval } from '@/lib/types';
import { PlayerState, type YouTubePlayer as Player } from '@/lib/youtube';
import { buildIntervals, computeWatchStats, type RawEvent } from '@/lib/watch-time';

/**
 * Wires the YouTube player to the event tracker.
 *
 * Everything here is cheap: a 250 ms `getCurrentTime()` read (a synchronous
 * property lookup on the player object, not a network call) plus an array push.
 * Nothing in this hook can block, delay or buffer the video — the only network
 * traffic is the tracker's batched POST every ten seconds.
 */

/** How often we sample the player position to detect seeks. */
const POLL_INTERVAL_MS = 250;

/** How often a still-playing session records a checkpoint. */
const HEARTBEAT_MS = 5_000;

/**
 * Seek thresholds.
 *
 * Forward: position jumped further than playback could have carried it.
 * Backward: position went back at all, which playback never does.
 *
 * Buffering and background-tab throttling both make the position advance *less*
 * than expected, never more, so neither can be mistaken for a seek.
 */
const FORWARD_SEEK_TOLERANCE = 1.5;
const BACKWARD_SEEK_TOLERANCE = 1.0;

export interface LiveStats {
  durationSeconds: number;
  watchedSeconds: number;
  skippedSeconds: number;
  reachedSeconds: number;
  watchedPercentage: number;
  reachedEnd: boolean;
  /**
   * The merged watched spans themselves, so the coverage ribbon can draw which
   * parts of the timeline were played rather than only how many seconds. Already
   * computed by `computeWatchStats` — this just stops throwing it away.
   */
  intervals: Interval[];
}

const EMPTY_STATS: LiveStats = {
  durationSeconds: 0,
  watchedSeconds: 0,
  skippedSeconds: 0,
  reachedSeconds: 0,
  watchedPercentage: 0,
  reachedEnd: false,
  intervals: [],
};

/** How long to wait for the player to report a title and duration. */
const METADATA_ATTEMPTS = 20;
const METADATA_INTERVAL_MS = 250;

/**
 * Polls the player until it reports a non-zero duration, then returns the
 * metadata. Gives up after ~5s and returns whatever it has — a live stream
 * legitimately has no duration and must still be trackable.
 */
async function waitForMetadata(
  player: Player,
  videoId: string,
): Promise<{ title: string; channelName: string; durationSeconds: number }> {
  for (let attempt = 0; attempt < METADATA_ATTEMPTS; attempt += 1) {
    const data = player.getVideoData?.();
    const duration = player.getDuration?.() ?? 0;

    if (data?.video_id === videoId && duration > 0) {
      return {
        title: data.title ?? '',
        channelName: data.author ?? '',
        durationSeconds: Math.round(duration),
      };
    }
    await new Promise((resolve) => setTimeout(resolve, METADATA_INTERVAL_MS));
  }

  const data = player.getVideoData?.();
  return {
    title: data?.title ?? '',
    channelName: data?.author ?? '',
    durationSeconds: Math.round(player.getDuration?.() ?? 0),
  };
}

/**
 * @param playlistId  YouTube playlist the current video belongs to, or null.
 *                    Stored in a ref rather than a dependency so a playlist
 *                    change never rebuilds the poll interval or the listeners.
 * @param onSessionChange  Fired when a new session opens, so the dashboard can
 *                    refresh without the tracker knowing anything about it.
 */
export function useWatchTracker(playlistId: string | null, onSessionChange?: () => void) {
  const playerRef = useRef<Player | null>(null);
  const trackerRef = useRef<EventTracker | null>(null);

  const playlistIdRef = useRef(playlistId);
  playlistIdRef.current = playlistId;

  const onSessionChangeRef = useRef(onSessionChange);
  onSessionChangeRef.current = onSessionChange;

  /** Local mirror of the event stream, used to render stats without the API. */
  const localEventsRef = useRef<RawEvent[]>([]);

  const pollStateRef = useRef({
    lastTime: 0,
    lastWallMs: 0,
    lastRate: 1,
    wasPlaying: false,
    lastHeartbeatMs: 0,
  });

  const sessionVideoRef = useRef<string | null>(null);
  const creatingRef = useRef<string | null>(null);

  const [liveStats, setLiveStats] = useState<LiveStats>(EMPTY_STATS);
  const [saving, setSaving] = useState<'idle' | 'ok' | 'offline'>('idle');
  const [resumePosition, setResumePosition] = useState<number | null>(null);
  /** Title and channel of the video on screen, for the Watch page header. */
  const [videoMeta, setVideoMeta] = useState<{ title: string; channelName: string } | null>(null);

  if (trackerRef.current === null) trackerRef.current = new EventTracker();

  /** Records an event locally (for the live numbers) and buffers it for the API. */
  const record = useCallback((type: EventType, videoTime: number, previousVideoTime?: number) => {
    localEventsRef.current.push({
      type,
      videoTime,
      previousVideoTime: previousVideoTime ?? null,
      timestamp: Date.now(),
    });
    trackerRef.current?.track(type, videoTime, previousVideoTime);
  }, []);

  const recomputeLocalStats = useCallback(() => {
    const player = playerRef.current;
    const duration = player?.getDuration?.() ?? 0;
    const { intervals, reachedEnd } = buildIntervals(localEventsRef.current);
    const stats = computeWatchStats(intervals, duration, reachedEnd);

    setLiveStats({
      durationSeconds: duration,
      watchedSeconds: stats.watchedSeconds,
      skippedSeconds: stats.skippedSeconds,
      reachedSeconds: stats.reachedSeconds,
      watchedPercentage: stats.watchedPercentage,
      reachedEnd: stats.reachedEnd,
      intervals: stats.intervals,
    });
  }, []);

  /** Opens a `watch_sessions` row for the video currently in the player. */
  const startSession = useCallback(async (id: string, playlistIndex: number) => {
    const player = playerRef.current;
    if (!player || creatingRef.current === id) return;
    creatingRef.current = id;

    localEventsRef.current = [];
    sessionVideoRef.current = id;
    setResumePosition(null);
    setLiveStats(EMPTY_STATS);
    setVideoMeta(null);

    // Opens the buffering window for this video and discards anything left
    // over from a video whose session failed to open, so its watch time can
    // never be credited to this one.
    trackerRef.current?.beginSession();

    // Right after loadVideoById the player knows the id but not yet the title
    // or duration, and a duration of 0 would make every percentage in the
    // dashboard meaningless. Waiting costs nothing: events tracked meanwhile
    // are buffered and stamped with the session id once it arrives.
    const metadata = await waitForMetadata(player, id);
    if (sessionVideoRef.current !== id) {
      creatingRef.current = null;
      return; // the user moved on while we were waiting
    }

    setVideoMeta({ title: metadata.title, channelName: metadata.channelName });

    const payload = {
      youtubeVideoId: id,
      title: metadata.title,
      channelName: metadata.channelName,
      durationSeconds: metadata.durationSeconds,
      youtubePlaylistId: playlistIdRef.current,
      playlistIndex: playlistIndex >= 0 ? playlistIndex : null,
    };

    try {
      const response = await fetch('/api/session', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });
      if (!response.ok) throw new Error(`HTTP ${response.status}`);

      const json = (await response.json()) as { sessionId: number; lastPosition: number | null };
      trackerRef.current?.setSessionId(json.sessionId);
      trackerRef.current?.start();
      setSaving('ok');

      // Offered as a button rather than an automatic jump — silently moving
      // someone's playhead is worse than letting them choose.
      setResumePosition(json.lastPosition ?? null);
      onSessionChangeRef.current?.();
    } catch {
      // No session id means nothing can be persisted, but the local stats and
      // the video itself keep working. This is the "analytics API is down"
      // path and it must stay silent as far as playback is concerned.
      setSaving('offline');
    } finally {
      creatingRef.current = null;
    }
  }, []);

  const handlePlayerReady = useCallback(
    (player: Player) => {
      playerRef.current = player;
      const id = player.getVideoData?.()?.video_id;
      // A cued playlist has no current video yet; the first onStateChange will
      // report one and open the session through handleVideoChange.
      if (id) void startSession(id, player.getPlaylistIndex?.() ?? -1);
    },
    [startSession],
  );

  const handleVideoChange = useCallback(
    ({ videoId, playlistIndex }: VideoChange) => {
      const player = playerRef.current;
      if (!player) return;
      if (sessionVideoRef.current === videoId) return;

      // Close out the outgoing video before the new session opens, so its
      // watched span ends at the position it was actually left on.
      record('VIDEO_CHANGE', player.getCurrentTime?.() ?? 0);
      void trackerRef.current?.flush();
      void startSession(videoId, playlistIndex);
    },
    [record, startSession],
  );

  const handleStateChange = useCallback(
    (state: number) => {
      const player = playerRef.current;
      if (!player) return;
      const time = player.getCurrentTime?.() ?? 0;

      if (state === PlayerState.PLAYING) record('PLAY', time);
      else if (state === PlayerState.PAUSED) record('PAUSE', time);
      else if (state === PlayerState.ENDED) record('END', time);

      // BUFFERING and CUED are not watch-state changes — the position is
      // unchanged and emitting events for them would just add noise.
      if (
        state === PlayerState.PLAYING ||
        state === PlayerState.PAUSED ||
        state === PlayerState.ENDED
      ) {
        pollStateRef.current.lastTime = time;
        pollStateRef.current.lastWallMs = performance.now();
        pollStateRef.current.wasPlaying = state === PlayerState.PLAYING;
        recomputeLocalStats();
      }
    },
    [record, recomputeLocalStats],
  );

  // Seek detection + heartbeat.
  useEffect(() => {
    const interval = setInterval(() => {
      const player = playerRef.current;
      if (!player || typeof player.getCurrentTime !== 'function') return;

      const now = performance.now();
      const state = player.getPlayerState?.() ?? -1;
      const time = player.getCurrentTime();
      const rate = player.getPlaybackRate?.() ?? 1;
      const poll = pollStateRef.current;

      if (poll.lastWallMs === 0) {
        poll.lastTime = time;
        poll.lastWallMs = now;
        poll.lastRate = rate;
        poll.wasPlaying = state === PlayerState.PLAYING;
        return;
      }

      const elapsed = (now - poll.lastWallMs) / 1000;
      const expected = poll.wasPlaying ? poll.lastTime + elapsed * poll.lastRate : poll.lastTime;

      const jumpedForward = time > expected + FORWARD_SEEK_TOLERANCE;
      const jumpedBackward = time < poll.lastTime - BACKWARD_SEEK_TOLERANCE;

      if (jumpedForward || jumpedBackward) {
        // previousVideoTime is where the user left, videoTime is where they
        // landed. Everything between the two is skipped, never watched.
        record('SEEK', time, poll.lastTime);
        recomputeLocalStats();
      } else if (
        state === PlayerState.PLAYING &&
        now - poll.lastHeartbeatMs >= HEARTBEAT_MS
      ) {
        record('HEARTBEAT', time);
        poll.lastHeartbeatMs = now;
        recomputeLocalStats();
      }

      poll.lastTime = time;
      poll.lastWallMs = now;
      poll.lastRate = rate;
      poll.wasPlaying = state === PlayerState.PLAYING;
    }, POLL_INTERVAL_MS);

    return () => clearInterval(interval);
  }, [record, recomputeLocalStats]);

  // Tab visibility.
  useEffect(() => {
    const onVisibilityChange = () => {
      const player = playerRef.current;
      if (!player) return;
      const time = player.getCurrentTime?.() ?? 0;
      record(document.hidden ? 'TAB_HIDDEN' : 'TAB_VISIBLE', time);
      recomputeLocalStats();
    };

    document.addEventListener('visibilitychange', onVisibilityChange);
    return () => document.removeEventListener('visibilitychange', onVisibilityChange);
  }, [record, recomputeLocalStats]);

  // Page unload: close the session and get the tail of the buffer out.
  useEffect(() => {
    const tracker = trackerRef.current;

    const onPageHide = () => {
      const player = playerRef.current;
      if (player) tracker?.track('SESSION_END', player.getCurrentTime?.() ?? 0);
      tracker?.flushWithBeacon();
    };

    window.addEventListener('pagehide', onPageHide);
    return () => {
      window.removeEventListener('pagehide', onPageHide);
      onPageHide();
      tracker?.stop();
    };
  }, []);

  /** Jumps to where this user previously stopped watching. */
  const resume = useCallback(() => {
    const player = playerRef.current;
    if (!player || resumePosition === null) return;
    player.seekTo(resumePosition, true);
    setResumePosition(null);
  }, [resumePosition]);

  return {
    handlePlayerReady,
    handleStateChange,
    handleVideoChange,
    liveStats,
    /** 'offline' means events are not reaching the server; playback is unaffected. */
    saving,
    /** Seconds this user previously reached in this video, if worth offering. */
    resumePosition,
    resume,
    /** Title and channel of the current video, once the player reports them. */
    videoMeta,
  };
}
