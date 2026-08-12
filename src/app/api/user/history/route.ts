import { NextResponse } from 'next/server';

import { loadHistory } from '@/lib/analytics';
import { requireUserId, UnauthorizedError } from '@/lib/auth';
import { parsePositiveInt } from '@/lib/dates';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/**
 * GET /api/user/history
 *
 * The signed-in account's watch history, straight from the database. Survives
 * logout, a cleared browser, and a different device.
 *
 * The user is taken from the session cookie on the server. There is no way to
 * ask for somebody else's history — no id parameter exists, and adding one
 * would not help, because every query filters on the authenticated id.
 */
export async function GET(request: Request) {
  try {
    const userId = await requireUserId();
    const limit = parsePositiveInt(new URL(request.url).searchParams.get('limit'), 100, 500);

    return NextResponse.json({ videos: await loadHistory(userId, limit) });
  } catch (error) {
    if (error instanceof UnauthorizedError) {
      return NextResponse.json({ error: 'Not signed in' }, { status: 401 });
    }
    console.error('GET /api/user/history failed:', error);
    return NextResponse.json({ error: 'Could not load history' }, { status: 500 });
  }
}
