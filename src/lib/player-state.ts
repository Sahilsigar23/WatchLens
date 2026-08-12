/**
 * Browser-side cache of *which* video is on screen.
 *
 * This is UI state, not user data: it exists so a page refresh does not empty
 * the player. Watch history, progress and analytics all live in the database
 * and are read back per authenticated account — nothing here is a system of
 * record, and losing it costs the user nothing but a click.
 *
 * It is cleared on sign-in and sign-out, because on a shared browser the last
 * video someone watched is itself information about them.
 */

export const PLAYER_STATE_KEY = 'watchlens.player.state';
export const PLAYER_PREFS_KEY = 'watchlens.player.prefs';

/**
 * Keys written before the project was renamed from StudyTrace. Nothing reads
 * them any more, so they would sit in every existing user's browser forever;
 * clearing them alongside the current ones sweeps them up on the next sign-in.
 */
const LEGACY_KEYS = ['studytrace.player.state', 'studytrace.player.prefs'];

export interface StoredPlayerState {
  videoId: string | null;
  playlistId: string | null;
  playlistIndex: number;
  /** Seconds into the video, for recovering from a hard reload. */
  position?: number;
}

export function readPlayerState(): StoredPlayerState | null {
  try {
    const raw = localStorage.getItem(PLAYER_STATE_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as StoredPlayerState;
    if (!parsed.videoId && !parsed.playlistId) return null;
    return parsed;
  } catch {
    return null;
  }
}

export function writePlayerState(state: StoredPlayerState): void {
  try {
    localStorage.setItem(PLAYER_STATE_KEY, JSON.stringify(state));
  } catch {
    // Private mode or a full quota. Persistence here is best-effort by design.
  }
}

/**
 * Wipes the cached player state. Called when the signed-in account changes so
 * the next user never inherits the previous one's open video. Their history is
 * untouched — it is in the database, keyed to their account.
 */
export function clearPlayerState(): void {
  try {
    for (const key of [PLAYER_STATE_KEY, PLAYER_PREFS_KEY, ...LEGACY_KEYS]) {
      localStorage.removeItem(key);
    }
  } catch {
    // Nothing to do; the server-side resume point still governs what loads.
  }
}
