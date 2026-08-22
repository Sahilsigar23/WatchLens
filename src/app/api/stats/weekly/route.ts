import { NextResponse } from 'next/server';

import { currentStreak, hourlyWatchedSeconds, loadSessions, summarizeByDay } from '@/lib/analytics';
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

    return NextResponse.json({
      days: summarizeByDay(sessions, dates, timeZone),
      streakDays: await currentStreak(userId, timeZone),
      /*
       * One 24-slot row per day, so the week can be drawn as a habit raster
       * rather than seven summed columns. Additive: existing consumers of
       * `days` / `streakDays` are untouched, the sessions are already loaded,
       * and `hourlyWatchedSeconds` is the same pure function /today uses.
       */
      hourly: dates.map((date) => hourlyWatchedSeconds(sessions, date, timeZone)),
    });
  } catch (error) {
    if (error instanceof UnauthorizedError) {
      return NextResponse.json({ error: 'Not signed in' }, { status: 401 });
    }
    console.error('GET /api/stats/weekly failed:', error);
    return NextResponse.json({ error: 'Could not load stats' }, { status: 500 });
  }
}
