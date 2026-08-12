import { NextResponse } from 'next/server';

import { loadHistory } from '@/lib/analytics';
import { requireUserId, UnauthorizedError } from '@/lib/auth';
import { parsePositiveInt } from '@/lib/dates';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/** GET /api/history?limit=100 — one row per video, newest first. */
export async function GET(request: Request) {
  try {
    const userId = await requireUserId();
    const limit = parsePositiveInt(new URL(request.url).searchParams.get('limit'), 100, 500);

    return NextResponse.json({ videos: await loadHistory(userId, limit) });
  } catch (error) {
    if (error instanceof UnauthorizedError) {
      return NextResponse.json({ error: 'Not signed in' }, { status: 401 });
    }
    console.error('GET /api/history failed:', error);
    return NextResponse.json({ error: 'Could not load history' }, { status: 500 });
  }
}
