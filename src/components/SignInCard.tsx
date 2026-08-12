'use client';

import { useRouter } from 'next/navigation';
import { useState } from 'react';

import { clearPlayerState } from '@/lib/player-state';

/**
 * Email-only sign-in.
 *
 * There is no password, so this identifies you rather than authenticates you —
 * stated here and on /privacy so nobody is misled. See lib/auth.ts for what to
 * replace before this is exposed to more than one person.
 */
export function SignInCard() {
  const router = useRouter();
  const [email, setEmail] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const submit = async (event: React.FormEvent) => {
    event.preventDefault();
    setBusy(true);
    setError(null);

    try {
      const response = await fetch('/api/auth', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email }),
      });
      if (!response.ok) {
        const data = (await response.json()) as { error?: string };
        throw new Error(data.error ?? 'Could not sign in.');
      }

      // Drop any cached player state left by a previous account on this
      // browser. This user's own video, playlist and position are restored
      // from the server instead — see /api/user/progress.
      clearPlayerState();
      router.refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not sign in.');
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="mx-auto max-w-md space-y-4 pt-10">
      <div className="space-y-1.5 text-center">
        <h1 className="text-2xl font-semibold tracking-tight">WatchLens</h1>
        <p className="text-sm text-muted">
          See how much of each YouTube video you actually watched — not how much of it played.
        </p>
      </div>

      <form onSubmit={submit} className="card space-y-3 p-5">
        <label htmlFor="email" className="block text-sm font-medium">
          Email
        </label>
        <input
          id="email"
          type="email"
          required
          value={email}
          onChange={(event) => setEmail(event.target.value)}
          placeholder="you@example.com"
          className="w-full rounded-xl border border-line bg-canvas px-4 py-2.5 text-sm outline-none focus:border-brand"
        />

        {error && <p className="text-sm text-brand">{error}</p>}

        <button
          type="submit"
          disabled={busy}
          className="w-full rounded-xl bg-brand px-4 py-2.5 text-sm font-medium text-white transition-opacity hover:opacity-90 disabled:opacity-50"
        >
          {busy ? 'Signing in…' : 'Continue'}
        </button>

        <p className="text-xs text-muted">
          Your email is only used to keep your history separate. This MVP has no password, so treat
          it as a personal tool rather than a shared, secured account.
        </p>
      </form>
    </div>
  );
}
