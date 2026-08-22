'use client';

import { useRouter } from 'next/navigation';

import { clearPlayerState } from '@/lib/player-state';

/**
 * Sign out, on the Settings page.
 *
 * The header carries the same action, but only from 640px up — below that the
 * header has no room for it and the mobile tab bar has no account slot, which
 * left a phone with no way to sign out at all. Settings is reachable from the
 * avatar at every width, so the control belongs here too.
 *
 * Identical behaviour to the header's: it ends the session and clears the
 * browser's cached "which video was on screen", and deletes nothing on the
 * server. See `Nav`.
 */
export function SignOutButton() {
  const router = useRouter();

  const signOut = async () => {
    await fetch('/api/auth', { method: 'DELETE' });
    clearPlayerState();
    router.refresh();
  };

  return (
    <button type="button" onClick={signOut} className="btn btn-quiet">
      Sign out
    </button>
  );
}
