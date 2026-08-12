import { NextResponse } from 'next/server';

import { loadSessions, summarizeByDay } from '@/lib/analytics';
import { requireUserId, UnauthorizedError } from '@/lib/auth';
import { timeZoneFromRequest, todayInZone, utcRangeFor, weekDatesInZone } from '@/lib/dates';
import { loadLifetimeTotals } from '@/lib/user-data';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/**
 * GET /api/user/statistics?tz=Asia/Kolkata
 *
 * Today, the current week, and all-time totals for the signed-in account in one
 * response — study time, entertainment time, actual watched, skipped.
 *
 * All of it is recomputed from the stored event log on every request, so it is
 * identical on any device and cannot drift from what the history page shows.
 */
export async function GET(request: Request) {
  try {
    const userId = await requireUserId();
    const timeZone = timeZoneFromRequest(request);

    // One session load covers both windows: the week already contains today.
    const week = weekDatesInZone(timeZone);
    const today = todayInZone(timeZone);
    const dates = week.includes(today) ? week : [...week, today];

    const { since, until } = utcRangeFor(dates);
    const sessions = await loadSessions(userId, since, until);
    const days = summarizeByDay(sessions, dates, timeZone);

    return NextResponse.json({
      timeZone,
      today: days.find((day) => day.date === today) ?? null,
      week: days.filter((day) => week.includes(day.date)),
      lifetime: await loadLifetimeTotals(userId),
    });
  } catch (error) {
    if (error instanceof UnauthorizedError) {
      return NextResponse.json({ error: 'Not signed in' }, { status: 401 });
    }
    console.error('GET /api/user/statistics failed:', error);
    return NextResponse.json({ error: 'Could not load statistics' }, { status: 500 });
  }
}
