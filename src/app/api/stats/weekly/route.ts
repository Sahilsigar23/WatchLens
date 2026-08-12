import { NextResponse } from 'next/server';

import { loadSessions, summarizeByDay } from '@/lib/analytics';
import { requireUserId, UnauthorizedError } from '@/lib/auth';
import { timeZoneFromRequest, utcRangeFor, weekDatesInZone } from '@/lib/dates';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/** GET /api/stats/weekly?tz=Asia/Kolkata — Monday..Sunday of the current week. */
export async function GET(request: Request) {
  try {
    const userId = await requireUserId();
    const timeZone = timeZoneFromRequest(request);

    const dates = weekDatesInZone(timeZone);
    const { since, until } = utcRangeFor(dates);
    const sessions = await loadSessions(userId, since, until);

    return NextResponse.json({ days: summarizeByDay(sessions, dates, timeZone) });
  } catch (error) {
    if (error instanceof UnauthorizedError) {
      return NextResponse.json({ error: 'Not signed in' }, { status: 401 });
    }
    console.error('GET /api/stats/weekly failed:', error);
    return NextResponse.json({ error: 'Could not load stats' }, { status: 500 });
  }
}
