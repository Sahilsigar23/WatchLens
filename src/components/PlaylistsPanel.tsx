'use client';

import { useRouter } from 'next/navigation';
import { useCallback, useEffect, useState } from 'react';

import { usePlayerCommands, useStatsRefresh } from '@/components/AppShell';
import { Icon } from '@/components/Icon';
import { formatDuration, formatPercentage } from '@/lib/format';
import type { UserPlaylistSummary } from '@/lib/types';

/**
 * Playlists presented as courses.
 *
 * "Continue" hands the playlist to the persistent player through the shell and
 * then routes to Watch — the player loads it in place, so nothing remounts and
 * no page reloads.
 */
export function PlaylistsPanel() {
  const router = useRouter();
  const { openPlaylist } = usePlayerCommands();
  const refreshSignal = useStatsRefresh();

  const [playlists, setPlaylists] = useState<UserPlaylistSummary[] | null>(null);
  const [failed, setFailed] = useState(false);

  const refresh = useCallback(async () => {
    try {
      const response = await fetch('/api/user/playlists');
      if (!response.ok) throw new Error(`HTTP ${response.status}`);
      const data = (await response.json()) as { playlists: UserPlaylistSummary[] };
      setPlaylists(data.playlists);
      setFailed(false);
    } catch {
      setFailed(true);
    }
  }, []);

  useEffect(() => {
    void refresh();
  }, [refresh, refreshSignal]);

  const open = (playlist: UserPlaylistSummary) => {
    openPlaylist(playlist.youtubePlaylistId);
    router.push('/');
  };

  if (failed) {
    return <p className="card p-6 text-sm text-muted">Could not load playlists. Try reloading.</p>;
  }

  if (playlists === null) {
    return (
      <div className="space-y-4">
        {[0, 1].map((i) => (
          <div key={i} className="skeleton h-44 w-full" />
        ))}
      </div>
    );
  }

  if (playlists.length === 0) {
    return (
      <div className="card flex flex-col items-center gap-3 p-10 text-center">
        <span className="grid h-12 w-12 place-items-center rounded-2xl bg-canvas text-muted">
          <Icon name="list" size={22} />
        </span>
        <p className="text-sm font-medium">No courses yet</p>
        <p className="max-w-xs text-sm text-muted">
          Paste a YouTube playlist link on the Watch page and it will appear here as a course you
          can work through.
        </p>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {playlists.map((playlist) => {
        const a = playlist.analytics;
        const done = a.videoCount > 0 ? a.completed / a.videoCount : 0;

        return (
          <article key={playlist.youtubePlaylistId} className="card card-hover overflow-hidden">
            <div className="flex flex-wrap items-start justify-between gap-4 p-5">
              <div className="min-w-0 flex-1">
                <h2 className="truncate text-base font-semibold tracking-tight sm:text-lg">
                  {playlist.title || 'Playlist'}
                </h2>
                <p className="mt-0.5 text-xs text-muted">
                  {a.completed} / {a.videoCount} videos completed · last opened{' '}
                  {formatDate(playlist.lastWatchedAt)}
                </p>
              </div>

              <button type="button" onClick={() => open(playlist)} className="btn btn-primary">
                <Icon name="play" size={12} />
                {playlist.resumeIndex !== null ? 'Continue learning' : 'Start'}
              </button>
            </div>

            <div className="px-5">
              <div className="flex h-2 w-full overflow-hidden rounded-full bg-canvas">
                <div
                  className="animate-grow h-full"
                  style={{
                    width: `${done * 100}%`,
                    backgroundImage:
                      'linear-gradient(90deg, var(--color-brand), var(--color-accent))',
                  }}
                />
              </div>
              <p className="mt-1.5 text-xs text-muted">
                {formatPercentage(done)} of the course complete
                {a.totalDurationSeconds > 0 &&
                  ` · ${formatPercentage(a.progress)} of its runtime actually watched`}
              </p>
            </div>

            <dl className="mt-4 grid grid-cols-2 gap-px border-t border-line bg-line sm:grid-cols-4">
              <Cell label="Actual learning" value={formatDuration(a.watchedSeconds)} highlight />
              <Cell
                label="Total length"
                value={a.totalDurationSeconds > 0 ? formatDuration(a.totalDurationSeconds) : '—'}
              />
              <Cell label="Skipped" value={formatDuration(a.skippedSeconds)} />
              <Cell label="In progress" value={`${a.inProgress} of ${a.videoCount}`} />
            </dl>

            {a.durationsIncomplete && (
              <p className="border-t border-line px-5 py-2.5 text-xs text-muted">
                Some durations are still unknown — they fill in as you open each video.
              </p>
            )}
          </article>
        );
      })}
    </div>
  );
}

function Cell({
  label,
  value,
  highlight,
}: {
  label: string;
  value: string;
  highlight?: boolean;
}) {
  return (
    <div className="bg-surface px-5 py-3">
      <dt className="text-xs text-muted">{label}</dt>
      <dd className={`stat mt-0.5 text-base font-semibold ${highlight ? 'gradient-text' : ''}`}>
        {value}
      </dd>
    </div>
  );
}

function formatDate(iso: string): string {
  return new Date(iso).toLocaleDateString(undefined, {
    day: 'numeric',
    month: 'short',
    year: 'numeric',
  });
}
