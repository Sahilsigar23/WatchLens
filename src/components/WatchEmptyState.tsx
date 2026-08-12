'use client';

import { useEffect, useState } from 'react';

import { Icon } from '@/components/Icon';
import { VideoInput } from '@/components/VideoInput';
import { formatPercentage } from '@/lib/format';
import type { HistoryRow } from '@/lib/types';

/**
 * What the Watch page shows before anything is playing.
 *
 * Rather than an empty frame, it offers the two things that actually get
 * someone watching: the input, and what they were watching last. The recent
 * list is fetched only here — the Watch page makes no analytics calls once a
 * video is on screen.
 */
export function WatchEmptyState({
  onSelectVideo,
  onSelectPlaylist,
}: {
  onSelectVideo: (videoId: string) => void;
  onSelectPlaylist: (playlistId: string) => void;
}) {
  const [recent, setRecent] = useState<HistoryRow[] | null>(null);

  useEffect(() => {
    let cancelled = false;

    fetch('/api/user/history?limit=4')
      .then((response) => (response.ok ? response.json() : null))
      .then((data: { videos?: HistoryRow[] } | null) => {
        if (!cancelled) setRecent(data?.videos ?? []);
      })
      .catch(() => {
        if (!cancelled) setRecent([]);
      });

    return () => {
      cancelled = true;
    };
  }, []);

  return (
    <div className="flex flex-col items-center px-4 py-14 text-center sm:py-20">
      <span
        className="mb-6 grid h-16 w-16 place-items-center rounded-2xl text-white"
        style={{
          backgroundImage: 'linear-gradient(135deg, var(--color-brand), var(--color-accent))',
          boxShadow: '0 18px 40px -18px color-mix(in oklab, var(--color-brand) 90%, transparent)',
        }}
      >
        <Icon name="lens" size={30} strokeWidth={1.8} />
      </span>

      <h1 className="text-2xl font-semibold tracking-tight sm:text-3xl">
        What are you <span className="gradient-text">learning</span>?
      </h1>
      <p className="mt-2 max-w-sm text-sm text-muted">
        Paste a YouTube video or playlist and start a session. WatchLens measures what you actually
        played — fast-forwarded parts never count.
      </p>

      <div className="mt-8 w-full">
        <VideoInput
          size="hero"
          onSelectVideo={onSelectVideo}
          onSelectPlaylist={onSelectPlaylist}
        />
      </div>

      {recent === null ? (
        <div className="mt-10 w-full max-w-lg space-y-2">
          {[0, 1, 2].map((i) => (
            <div key={i} className="skeleton h-14 w-full" />
          ))}
        </div>
      ) : recent.length > 0 ? (
        <div className="mt-10 w-full max-w-lg text-left">
          <h2 className="mb-2 px-1 text-xs font-medium uppercase tracking-wide text-muted">
            Continue watching
          </h2>
          <ul className="space-y-2">
            {recent.map((video) => (
              <li key={video.youtubeVideoId}>
                <button
                  type="button"
                  onClick={() => onSelectVideo(video.youtubeVideoId)}
                  className="card card-hover flex w-full items-center gap-3 p-2 text-left"
                >
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img
                    src={`https://i.ytimg.com/vi/${video.youtubeVideoId}/mqdefault.jpg`}
                    alt=""
                    className="h-12 w-20 shrink-0 rounded-lg object-cover"
                    loading="lazy"
                  />
                  <span className="min-w-0 flex-1">
                    <span className="block truncate text-sm font-medium">
                      {video.title || video.youtubeVideoId}
                    </span>
                    <span className="block truncate text-xs text-muted">
                      {video.channelName} · {formatPercentage(video.watchedPercentage)} actually
                      watched
                    </span>
                  </span>
                  <span className="shrink-0 pr-1 text-muted">
                    <Icon name="play" size={14} />
                  </span>
                </button>
              </li>
            ))}
          </ul>
        </div>
      ) : null}
    </div>
  );
}
