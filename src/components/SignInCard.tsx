'use client';

import { useRouter } from 'next/navigation';
import { useState } from 'react';

import { clearPlayerState } from '@/lib/player-state';

/** Kept in step with MIN_PASSWORD_LENGTH in lib/password.ts. */
const MIN_PASSWORD_LENGTH = 8;

type Mode = 'signin' | 'signup';

/**
 * Email + password sign-in and sign-up.
 *
 * The server is the authority on every rule here; the `minLength` below is a
 * convenience so the browser catches a short password before a round-trip, not
 * the check that matters.
 */
export function SignInCard() {
  const router = useRouter();
  const [mode, setMode] = useState<Mode>('signin');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
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
        body: JSON.stringify({ email, password, action: mode }),
      });
      if (!response.ok) {
        const data = (await response.json()) as { error?: string };
        throw new Error(data.error ?? 'Could not sign in.');
      }

      // Drop any cached player state left by a previous account on this
      // browser. This user's own video, playlist and position are restored
      // from the server instead — see /api/user/progress.
      clearPlayerState();
      setPassword('');
      router.refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not sign in.');
    } finally {
      setBusy(false);
    }
  };

  const switchMode = () => {
    setMode((current) => (current === 'signin' ? 'signup' : 'signin'));
    setError(null);
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
        <div className="space-y-1.5">
          <label htmlFor="email" className="block text-sm font-medium">
            Email
          </label>
          <input
            id="email"
            name="email"
            type="email"
            required
            autoComplete="email"
            value={email}
            onChange={(event) => setEmail(event.target.value)}
            placeholder="you@example.com"
            className="w-full rounded-xl border border-line bg-canvas px-4 py-2.5 text-sm outline-none focus:border-brand"
          />
        </div>

        <div className="space-y-1.5">
          <label htmlFor="password" className="block text-sm font-medium">
            Password
          </label>
          <input
            id="password"
            name="password"
            type="password"
            required
            minLength={MIN_PASSWORD_LENGTH}
            // Tells a password manager to offer a new password on sign-up and
            // the saved one on sign-in, rather than guessing from the markup.
            autoComplete={mode === 'signup' ? 'new-password' : 'current-password'}
            value={password}
            onChange={(event) => setPassword(event.target.value)}
            placeholder={mode === 'signup' ? `At least ${MIN_PASSWORD_LENGTH} characters` : '••••••••'}
            className="w-full rounded-xl border border-line bg-canvas px-4 py-2.5 text-sm outline-none focus:border-brand"
          />
        </div>

        {error && (
          <p role="alert" className="text-sm text-brand">
            {error}
          </p>
        )}

        <button
          type="submit"
          disabled={busy}
          className="w-full rounded-xl bg-brand px-4 py-2.5 text-sm font-medium text-white transition-opacity hover:opacity-90 disabled:opacity-50"
        >
          {busy
            ? mode === 'signup'
              ? 'Creating account…'
              : 'Signing in…'
            : mode === 'signup'
              ? 'Create account'
              : 'Sign in'}
        </button>

        <p className="text-center text-sm text-muted">
          {mode === 'signup' ? 'Already have an account?' : 'No account yet?'}{' '}
          <button
            type="button"
            onClick={switchMode}
            className="underline underline-offset-2 hover:text-ink"
          >
            {mode === 'signup' ? 'Sign in' : 'Create one'}
          </button>
        </p>

        <p className="text-xs text-muted">
          Your password is hashed with scrypt and never stored in readable form. There is no
          password reset yet — recovering an account means deleting it from the privacy page and
          signing up again.
        </p>
      </form>
    </div>
  );
}
