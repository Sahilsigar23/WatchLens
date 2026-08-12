'use client';

import { createContext, useCallback, useContext, useState, type ReactNode } from 'react';

import { PlayerShell } from '@/components/PlayerShell';

/**
 * Bumped whenever a watch session opens, so the dashboard knows its numbers are
 * stale. A counter rather than the data itself keeps the player and the
 * analytics completely decoupled: the shell never learns what a "stat" is, and
 * a failed stats fetch can never affect playback.
 */
const StatsRefreshContext = createContext(0);

export function useStatsRefresh(): number {
  return useContext(StatsRefreshContext);
}

/**
 * The persistent application shell.
 *
 * `children` arrives as a prop from the server layout, so when this component
 * re-renders (a stats bump, a player state change) React reuses the same child
 * element and the page below is not re-rendered. That is what makes navigation
 * feel instant: only the routed segment changes, and the player is untouched
 * because it lives here rather than inside any page.
 */
export function AppShell({ signedIn, children }: { signedIn: boolean; children: ReactNode }) {
  const [version, setVersion] = useState(0);
  const bump = useCallback(() => setVersion((current) => current + 1), []);

  return (
    <StatsRefreshContext.Provider value={version}>
      <div className="mx-auto w-full max-w-6xl px-4 pb-16 pt-6 sm:px-6">
        {signedIn && <PlayerShell onSessionChange={bump} />}
        <main>{children}</main>
      </div>
    </StatsRefreshContext.Provider>
  );
}
