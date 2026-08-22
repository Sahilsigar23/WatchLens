'use client';

import { usePathname } from 'next/navigation';
import { createContext, useCallback, useContext, useMemo, useState, type ReactNode } from 'react';

import { PlayerShell } from '@/components/PlayerShell';

/**
 * Bumped whenever a watch session opens, so the dashboard sections know their
 * numbers are stale. A counter rather than the data itself keeps the player and
 * the analytics completely decoupled: the shell never learns what a "stat" is,
 * and a failed stats fetch can never affect playback.
 */
const StatsRefreshContext = createContext(0);

export function useStatsRefresh(): number {
  return useContext(StatsRefreshContext);
}

/** A request from another section for the player to open something. */
export interface PlayerRequest {
  kind: 'playlist' | 'video';
  id: string;
  /** Distinguishes two requests for the same id, so re-opening works. */
  nonce: number;
}

interface PlayerCommands {
  openPlaylist: (playlistId: string) => void;
  openVideo: (videoId: string) => void;
}

const PlayerCommandContext = createContext<PlayerCommands>({
  openPlaylist: () => {},
  openVideo: () => {},
});

/**
 * Lets a section outside the player ask it to load something — the Playlists
 * page opening a course, for example. It goes through the shell rather than a
 * URL so the player is commanded in place, with no remount and no reload.
 */
export function usePlayerCommands(): PlayerCommands {
  return useContext(PlayerCommandContext);
}

/**
 * The persistent application shell.
 *
 * `children` arrives as a prop from the server layout, so when this component
 * re-renders (a stats bump, a player request) React reuses the same child
 * element and the routed page below is not re-rendered. That is what makes
 * navigation feel instant: only the routed segment changes, and the player is
 * untouched because it lives here rather than inside any page.
 */
export function AppShell({ signedIn, children }: { signedIn: boolean; children: ReactNode }) {
  const pathname = usePathname();
  const [version, setVersion] = useState(0);
  const [request, setRequest] = useState<PlayerRequest | null>(null);

  const bump = useCallback(() => setVersion((current) => current + 1), []);

  const commands = useMemo<PlayerCommands>(
    () => ({
      openPlaylist: (id) =>
        setRequest({ kind: 'playlist', id, nonce: performance.now() }),
      openVideo: (id) => setRequest({ kind: 'video', id, nonce: performance.now() }),
    }),
    [],
  );

  return (
    <StatsRefreshContext.Provider value={version}>
      <PlayerCommandContext.Provider value={commands}>
        {/*
          `.shell` owns the horizontal measure and gutters for the whole app —
          the header uses the same class, so the brand mark lines up with the
          content beneath it at every width.

          Bottom padding has to clear whatever is docked over the page: the tab
          bar alone on Watch, the tab bar *and* the mini-player dock everywhere
          else. Without the larger value the last row of a list sits permanently
          underneath the dock and cannot be scrolled into view. Both go away at
          `lg`, where the tab bar is replaced by the header rail.
        */}
        <div
          className={`shell pt-5 lg:pt-8 ${
            /*
             * `/watch` is the one route with no docked mini-player, because the
             * player is laid out in flow there — so it only has to clear the
             * mobile tab bar. Every other route, the landing page included, must
             * also clear the dock, which occupies ~216px of the bottom-right
             * corner (192px tall plus its 24px offset). Under-reserving here is
             * not cosmetic: the last row of a short list ends up permanently
             * underneath the dock with no way to scroll it into view.
             */
            pathname === '/watch' ? 'pb-28 lg:pb-16' : 'pb-44 lg:pb-56'
          }`}
        >
          {signedIn && <PlayerShell onSessionChange={bump} request={request} />}
          {/*
            Keyed by route so the section fades up on each navigation. Only
            `main` is keyed — the player is a sibling and is never touched.
          */}
          <main key={pathname} className="animate-rise">
            {children}
          </main>
        </div>
      </PlayerCommandContext.Provider>
    </StatsRefreshContext.Provider>
  );
}
