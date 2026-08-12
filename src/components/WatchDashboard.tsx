'use client';

import { useCallback, useEffect, useState } from 'react';

import { LiveSession } from '@/components/LiveSession';
import { TodayStats } from '@/components/StatCards';
import { TrackingNotice } from '@/components/TrackingNotice';
import { VideoInput } from '@/components/VideoInput';
import { WeeklyChart } from '@/components/WeeklyChart';
import { YouTubePlayer } from '@/components/YouTubePlayer';
import { useWatchTracker } from '@/hooks/useWatchTracker';
import { formatTimecode } from '@/lib/format';
import type { DayStats } from '@/lib/types';

/** Refresh the dashboard numbers on this cadence while a video is open. */
const STATS_REFRESH_MS = 60_000;

/**
 * The watch page: search/paste, player, live per-video numbers, then the daily
 * and weekly rollups.
 *
 * Analytics fetching is completely separate from playback — every call here can
 * fail and the player carries on. That is why the stats state starts as `null`
 * and simply stays stale on error rather than surfacing a blocking message.
 */
export function WatchDashboard() {
  const [videoId, setVideoId] = useState<string | null>(null);
  const [today, setToday] = useState<DayStats | null>(null);
  const [week, setWeek] = useState<DayStats[]>([]);

  const { handlePlayerReady, handleStateChange, handleVideoChange, liveStats, saving, resumePosition, resume } =
    useWatchTracker(videoId);

  const refreshStats = useCallback(async () => {
    const tz = Intl.DateTimeFormat().resolvedOptions().timeZone;
    try {
      const [todayResponse, weekResponse] = await Promise.all([
        fetch(`/api/stats/today?tz=${encodeURIComponent(tz)}`),
        fetch(`/api/stats/weekly?tz=${encodeURIComponent(tz)}`),
      ]);
      if (todayResponse.ok) setToday(((await todayResponse.json()) as { stats: DayStats }).stats);
      if (weekResponse.ok) setWeek(((await weekResponse.json()) as { days: DayStats[] }).days);
    } catch {
      // Keep whatever we last had. Stale numbers beat an error banner.
    }
  }, []);

  useEffect(() => {
    void refreshStats();
    const interval = setInterval(() => void refreshStats(), STATS_REFRESH_MS);
    return () => clearInterval(interval);
  }, [refreshStats]);

  // A new video means the previous one's session is complete, so it is worth
  // pulling fresh totals rather than waiting for the next tick.
  useEffect(() => {
    if (videoId) void refreshStats();
  }, [videoId, refreshStats]);

  return (
    <div className="space-y-6">
      <VideoInput onSelect={setVideoId} />

      {videoId ? (
        <div className="space-y-4">
          <YouTubePlayer
            videoId={videoId}
            onReady={handlePlayerReady}
            onStateChange={handleStateChange}
            onVideoChange={handleVideoChange}
          />

          {resumePosition !== null && (
            <button
              type="button"
              onClick={resume}
              className="rounded-lg border border-line bg-surface px-3 py-1.5 text-sm transition-colors hover:border-brand"
            >
              Resume from {formatTimecode(resumePosition)}
            </button>
          )}

          <LiveSession stats={liveStats} saving={saving} />
        </div>
      ) : (
        <div className="card flex flex-col items-center justify-center gap-2 px-6 py-16 text-center">
          <p className="text-lg font-medium">Paste a YouTube link to start</p>
          <p className="max-w-md text-sm text-muted">
            Watch here instead of on YouTube and StudyTrace will measure how much of each video you
            actually played — fast-forwarded parts do not count.
          </p>
        </div>
      )}

      <TrackingNotice />
      <TodayStats stats={today} />
      <WeeklyChart days={week} />
    </div>
  );
}
