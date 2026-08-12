import { NextResponse } from 'next/server';

import { requireUserId, signOut, UnauthorizedError } from '@/lib/auth';
import { query } from '@/lib/db';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/**
 * DELETE /api/account?scope=history — erase all watch history, keep the account.
 * DELETE /api/account?scope=account — erase the account and everything with it.
 *
 * Both are real deletes, not soft-deletes or flags. `ON DELETE CASCADE` on
 * watch_sessions and watch_events means removing the sessions removes every
 * event, and removing the user removes every session.
 *
 * Rows in `videos` are intentionally left alone: they hold only public YouTube
 * metadata (id, title, channel, duration) and nothing about who watched what.
 */
export async function DELETE(request: Request) {
  try {
    const userId = await requireUserId();
    const scope = new URL(request.url).searchParams.get('scope');

    if (scope === 'history') {
      await query('DELETE FROM watch_sessions WHERE user_id = $1', [userId]);
      return NextResponse.json({ ok: true, deleted: 'history' });
    }

    if (scope === 'account') {
      await query('DELETE FROM users WHERE id = $1', [userId]);
      await signOut();
      return NextResponse.json({ ok: true, deleted: 'account' });
    }

    return NextResponse.json({ error: 'scope must be "history" or "account"' }, { status: 400 });
  } catch (error) {
    if (error instanceof UnauthorizedError) {
      return NextResponse.json({ error: 'Not signed in' }, { status: 401 });
    }
    console.error('DELETE /api/account failed:', error);
    return NextResponse.json({ error: 'Could not delete' }, { status: 500 });
  }
}
