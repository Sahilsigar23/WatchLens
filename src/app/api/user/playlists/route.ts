import { NextResponse } from 'next/server';

import { requireUserId, UnauthorizedError } from '@/lib/auth';
import { parsePositiveInt } from '@/lib/dates';
import { loadUserPlaylists } from '@/lib/user-data';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/**
 * GET /api/user/playlists
 *
 * Every playlist this account has watched from, with its progress and the index
 * to continue at. Scoped to the authenticated user by the session cookie.
 */
export async function GET(request: Request) {
  try {
    const userId = await requireUserId();
    const limit = parsePositiveInt(new URL(request.url).searchParams.get('limit'), 25, 100);

    return NextResponse.json({ playlists: await loadUserPlaylists(userId, limit) });
  } catch (error) {
    if (error instanceof UnauthorizedError) {
      return NextResponse.json({ error: 'Not signed in' }, { status: 401 });
    }
    console.error('GET /api/user/playlists failed:', error);
    return NextResponse.json({ error: 'Could not load playlists' }, { status: 500 });
  }
}
