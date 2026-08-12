import { NextResponse } from 'next/server';

import { hourlyWatchedSeconds, loadSessions, summarizeByDay } from '@/lib/analytics';
import { requireUserId, UnauthorizedError } from '@/lib/auth';
import { timeZoneFromRequest, todayInZone, utcRangeFor } from '@/lib/dates';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/** GET /api/stats/today?tz=Asia/Kolkata — today's learning report. */
export async function GET(request: Request) {
  try {
    const userId = await requireUserId();
    const timeZone = timeZoneFromRequest(request);

    const dates = [todayInZone(timeZone)];
    const { since, until } = utcRangeFor(dates);
    const sessions = await loadSessions(userId, since, until);

    return NextResponse.json({
      stats: summarizeByDay(sessions, dates, timeZone)[0],
      hourly: hourlyWatchedSeconds(sessions, dates[0], timeZone),
    });
  } catch (error) {
    if (error instanceof UnauthorizedError) {
      return NextResponse.json({ error: 'Not signed in' }, { status: 401 });
    }
    console.error('GET /api/stats/today failed:', error);
    return NextResponse.json({ error: 'Could not load stats' }, { status: 500 });
  }
}
