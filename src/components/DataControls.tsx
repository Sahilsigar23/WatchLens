'use client';

import { useRouter } from 'next/navigation';
import { useState } from 'react';

/**
 * Delete history / delete account.
 *
 * Both need a typed confirmation rather than a single click: these are real,
 * irreversible deletes and a misclick should not be enough to trigger one.
 */
export function DataControls() {
  const router = useRouter();
  const [pending, setPending] = useState<'history' | 'account' | null>(null);
  const [confirmText, setConfirmText] = useState('');
  const [message, setMessage] = useState<string | null>(null);

  const run = async (scope: 'history' | 'account') => {
    setMessage(null);
    try {
      const response = await fetch(`/api/account?scope=${scope}`, { method: 'DELETE' });
      if (!response.ok) throw new Error(`HTTP ${response.status}`);

      setPending(null);
      setConfirmText('');
      setMessage(
        scope === 'history'
          ? 'Your watch history has been deleted.'
          : 'Your account and all of its data have been deleted.',
      );
      router.refresh();
    } catch {
      setMessage('Delete failed. Please try again.');
    }
  };

  const expected = pending === 'account' ? 'DELETE ACCOUNT' : 'DELETE HISTORY';

  return (
    <div className="card space-y-4 p-5">
      <div>
        <h2 className="text-sm font-semibold">Your data</h2>
        <p className="mt-1 text-sm text-muted">
          Deletes run immediately against the database. There is no soft-delete and no backup copy
          to restore from.
        </p>
      </div>

      {pending === null ? (
        <div className="flex flex-wrap gap-2">
          <button
            type="button"
            onClick={() => setPending('history')}
            className="rounded-lg border border-line px-3 py-2 text-sm transition-colors hover:border-brand"
          >
            Delete watch history
          </button>
          <button
            type="button"
            onClick={() => setPending('account')}
            className="rounded-lg border border-line px-3 py-2 text-sm text-brand transition-colors hover:border-brand"
          >
            Delete account and all data
          </button>
        </div>
      ) : (
        <div className="space-y-3">
          <p className="text-sm">
            Type <code className="font-semibold">{expected}</code> to confirm.
            {pending === 'account' &&
              ' This removes your account, every session and every event.'}
          </p>
          <input
            type="text"
            value={confirmText}
            onChange={(event) => setConfirmText(event.target.value)}
            className="w-full rounded-lg border border-line bg-canvas px-3 py-2 text-sm outline-none focus:border-brand"
            placeholder={expected}
          />
          <div className="flex gap-2">
            <button
              type="button"
              disabled={confirmText !== expected}
              onClick={() => void run(pending)}
              className="rounded-lg bg-brand px-3 py-2 text-sm font-medium text-white transition-opacity hover:opacity-90 disabled:opacity-40"
            >
              Confirm delete
            </button>
            <button
              type="button"
              onClick={() => {
                setPending(null);
                setConfirmText('');
              }}
              className="rounded-lg border border-line px-3 py-2 text-sm"
            >
              Cancel
            </button>
          </div>
        </div>
      )}

      {message && <p className="text-sm text-muted">{message}</p>}
    </div>
  );
}
