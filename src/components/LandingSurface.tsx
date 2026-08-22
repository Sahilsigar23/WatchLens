'use client';

import { useRouter } from 'next/navigation';

import { usePlayerCommands } from '@/components/AppShell';
import { WatchEmptyState } from '@/components/WatchEmptyState';

/**
 * The landing surface at `/` — the app's front door.
 *
 * Separate from `/watch` so the brand mark has somewhere to go: clicking the
 * logo returns here, and anything already playing keeps playing in the corner
 * dock rather than being torn down. That is only possible because the player
 * lives in the layout, not in a page (see PlayerShell).
 *
 * Choosing something here does two things in order: it commands the persistent
 * player through the shell's context — so the iframe is loaded in place, never
 * remounted — and only then routes to `/watch`, where that same player is
 * rendered full size.
 */
export function LandingSurface() {
  const router = useRouter();
  const { openVideo, openPlaylist } = usePlayerCommands();

  return (
    <WatchEmptyState
      onSelectVideo={(videoId) => {
        openVideo(videoId);
        router.push('/watch');
      }}
      onSelectPlaylist={(playlistId) => {
        openPlaylist(playlistId);
        router.push('/watch');
      }}
    />
  );
}
