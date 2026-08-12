import { NextResponse } from 'next/server';

import { requireUserId, UnauthorizedError } from '@/lib/auth';
import { parsePositiveInt } from '@/lib/dates';
import { loadUserProgress } from '@/lib/user-data';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/**
 * GET /api/user/progress
 *
 * Per-video progress (watched, skipped, percentage, last position) plus the
 * single point this account should resume from.
 *
 * This is what makes a second device work: the player asks the server where the
 * account left off rather than reading browser storage, so signing in on a
 * phone lands on the same video at the same position as the laptop.
 */
export async function GET(request: Request) {
  try {
    const userId = await requireUserId();
    const limit = parsePositiveInt(new URL(request.url).searchParams.get('limit'), 200, 500);

    return NextResponse.json(await loadUserProgress(userId, limit));
  } catch (error) {
    if (error instanceof UnauthorizedError) {
      return NextResponse.json({ error: 'Not signed in' }, { status: 401 });
    }
    console.error('GET /api/user/progress failed:', error);
    return NextResponse.json({ error: 'Could not load progress' }, { status: 500 });
  }
}
