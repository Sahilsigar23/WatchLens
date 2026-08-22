'use client';

import { useEffect, useState } from 'react';

import { Ratio } from '@/components/Coverage';
import { CoverageDemo } from '@/components/CoverageDemo';
import { Icon } from '@/components/Icon';
import { VideoInput } from '@/components/VideoInput';
import { formatPercentage } from '@/lib/format';
import type { HistoryRow } from '@/lib/types';

/**
 * What the Watch page shows before anything is playing.
 *
 * It opens with the product's actual thesis rather than a logo and a tagline:
 * a coverage ribbon, annotated, showing what "actually watched" means. That is
 * the one graphic the whole app is built around, so meeting it first teaches
 * the vocabulary that every other screen then uses.
 *
 * Under it, the two things that get someone watching: the input, and what they
 * were watching last. The recent list is fetched only here — the Watch page
 * makes no analytics calls once a video is on screen.
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
    <div className="w-full py-6 sm:py-10">
      {/*
        The figure takes the full width of the shell. It is a *timeline*, so
        width is resolution: at 1376px each of its 42 minute-ticks gets real
        space, and the watched stretches are legible as stretches rather than
        slivers. This is the one block that genuinely wants the whole measure.
      */}
      <CoverageDemo />

      {/*
        Below it, two columns from `lg`: the action on the left, what you were
        already watching on the right. Stacked, they left half the screen empty
        on a laptop; side by side they fill it with the two things that actually
        get someone watching.
      */}
      <div className="mt-8 grid gap-8 lg:mt-10 lg:grid-cols-[minmax(0,1fr)_minmax(0,22rem)] lg:gap-12 xl:grid-cols-[minmax(0,1fr)_minmax(0,26rem)]">
        <div className="min-w-0">
          <h1 className="display text-3xl sm:text-[2.75rem] lg:text-5xl">
            How much did you
            <br />
            <span className="text-signal">actually</span> watch?
          </h1>
          {/* `.measure` caps the line length — the column is wide enough at
              1440px that unbounded body text would run past comfortable. */}
          <p className="measure mt-3 text-sm leading-relaxed text-dim sm:text-base">
            Play a video here and WatchLens records the stretches you really watched.
            Fast-forwarding moves the progress bar — it never adds watched time.
          </p>

          <div className="mt-7 max-w-2xl">
            <VideoInput
              size="hero"
              onSelectVideo={onSelectVideo}
              onSelectPlaylist={onSelectPlaylist}
            />
          </div>
        </div>

        {/* ---- continue ------------------------------------------------------- */}
        <div className="min-w-0">
      {recent === null ? (
        <div className="space-y-2">
          {[0, 1, 2].map((i) => (
            <div key={i} className="skeleton h-16 w-full" />
          ))}
        </div>
      ) : recent.length > 0 ? (
        <div>
          <h2 className="eyebrow mb-3">Continue watching</h2>
          <ul className="space-y-2">
            {recent.map((video) => (
              <li key={video.youtubeVideoId}>
                <button
                  type="button"
                  onClick={() => onSelectVideo(video.youtubeVideoId)}
                  className="panel panel-action w-full p-2.5 text-left"
                >
                  <span className="flex items-center gap-3">
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img
                      src={`https://i.ytimg.com/vi/${video.youtubeVideoId}/mqdefault.jpg`}
                      alt=""
                      className="h-11 w-[4.9rem] shrink-0 rounded-md object-cover"
                      loading="lazy"
                    />
                    <span className="min-w-0 flex-1">
                      <span className="block truncate text-sm font-medium">
                        {video.title || video.youtubeVideoId}
                      </span>
                      <span className="mt-0.5 block truncate text-xs text-dim">
                        {video.channelName}
                      </span>
                    </span>
                    <span className="data shrink-0 text-xs text-signal">
                      {formatPercentage(video.watchedPercentage)}
                    </span>
                    <span aria-hidden className="shrink-0 text-dim">
                      <Icon name="play" size={12} />
                    </span>
                  </span>

                  <span className="mt-2.5 block">
                    <Ratio
                      watchedSeconds={video.watchedSeconds}
                      skippedSeconds={video.skippedSeconds}
                      totalSeconds={video.durationSeconds}
                    />
                  </span>
                </button>
              </li>
            ))}
          </ul>
        </div>
      ) : null}
        </div>
      </div>
    </div>
  );
}
