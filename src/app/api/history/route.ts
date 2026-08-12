import { NextResponse } from 'next/server';

import { loadHistory } from '@/lib/analytics';
import { requireUserId, UnauthorizedError } from '@/lib/auth';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/** GET /api/history?limit=100 — one row per video, newest first. */
export async function GET(request: Request) {
  try {
    const userId = await requireUserId();
    const raw = Number(new URL(request.url).searchParams.get('limit'));
    const limit = Number.isFinite(raw) ? Math.min(500, Math.max(1, raw)) : 100;

    return NextResponse.json({ videos: await loadHistory(userId, limit) });
  } catch (error) {
    if (error instanceof UnauthorizedError) {
      return NextResponse.json({ error: 'Not signed in' }, { status: 401 });
    }
    console.error('GET /api/history failed:', error);
    return NextResponse.json({ error: 'Could not load history' }, { status: 500 });
  }
}
