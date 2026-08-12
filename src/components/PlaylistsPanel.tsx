'use client';

import { useRouter } from 'next/navigation';
import { useCallback, useEffect, useState } from 'react';

import { usePlayerCommands, useStatsRefresh } from '@/components/AppShell';
import { PlaylistAnalytics } from '@/components/PlaylistAnalytics';
import type { UserPlaylistSummary } from '@/lib/types';

/**
 * Every playlist this account has opened, with its progress.
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
    return <p className="card p-6 text-sm text-muted">Loading playlists…</p>;
  }

  if (playlists.length === 0) {
    return (
      <p className="card p-6 text-sm text-muted">
        No playlists yet. Paste a YouTube playlist link on the Watch page and it will appear here.
      </p>
    );
  }

  return (
    <div className="space-y-5">
      {playlists.map((playlist) => (
        <section key={playlist.youtubePlaylistId} className="space-y-3">
          <div className="flex flex-wrap items-baseline justify-between gap-2">
            <div className="min-w-0">
              <h2 className="truncate text-base font-semibold tracking-tight">
                {playlist.title || 'Playlist'}
              </h2>
              <p className="text-xs text-muted">
                Last opened {formatDate(playlist.lastWatchedAt)}
                {playlist.resumeIndex !== null && ` · continue at video ${playlist.resumeIndex + 1}`}
              </p>
            </div>

            <button
              type="button"
              onClick={() => open(playlist)}
              className="shrink-0 rounded-lg bg-brand px-3 py-1.5 text-sm font-medium text-white transition-opacity hover:opacity-90"
            >
              {playlist.resumeIndex !== null ? 'Continue' : 'Open'}
            </button>
          </div>

          <PlaylistAnalytics analytics={playlist.analytics} />
        </section>
      ))}
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
