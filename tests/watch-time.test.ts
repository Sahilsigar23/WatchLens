import { describe, expect, it } from 'vitest';

import { mergeIntervals, unionLength } from '@/lib/intervals';
import { buildIntervals, computeWatchStats, statsForVideo, type RawEvent } from '@/lib/watch-time';

/**
 * The watch-time algorithm is the whole point of the product, so these tests
 * assert the *numbers*, not just that some intervals came back.
 *
 * Timestamps are real wall-clock milliseconds that advance in step with
 * playback. They matter: the algorithm cross-checks every span against the time
 * that actually elapsed, so events with fabricated timestamps would not behave
 * like a real session.
 */

const MINUTE = 60;

/** Sugar for building an event stream: `event('PLAY', videoTime, wallSeconds)`. */
function event(
  type: RawEvent['type'],
  videoTime: number,
  wallSeconds: number,
  previousVideoTime: number | null = null,
): RawEvent {
  return { type, videoTime, previousVideoTime, timestamp: wallSeconds * 1000 };
}

function statsFor(events: RawEvent[], duration: number) {
  const { intervals, reachedEnd } = buildIntervals(events);
  return computeWatchStats(intervals, duration, reachedEnd);
}

describe('the fast-forward case from the brief', () => {
  // 60 min video: watch 0:00-2:00, fast-forward to 55:00, watch to the end.
  const duration = 60 * MINUTE;
  const events = [
    event('PLAY', 0, 0),
    event('SEEK', 55 * MINUTE, 120, 2 * MINUTE),
    event('END', 60 * MINUTE, 420),
  ];

  it('counts 7 minutes watched, not 60', () => {
    expect(statsFor(events, duration).watchedSeconds).toBe(7 * MINUTE);
  });

  it('reports the 53 fast-forwarded minutes as skipped', () => {
    expect(statsFor(events, duration).skippedSeconds).toBe(53 * MINUTE);
  });

  it('still records that the end was reached', () => {
    expect(statsFor(events, duration).reachedEnd).toBe(true);
  });

  it('reports completion by position but percentage by real watching', () => {
    const stats = statsFor(events, duration);
    expect(stats.reachedSeconds).toBe(duration);
    expect(stats.watchedPercentage).toBeCloseTo(7 / 60, 4);
  });
});

describe('seeking', () => {
  it('does not count a backward seek twice', () => {
    // Watch 0-60, jump back to 0:10, watch to 0:40. Unique coverage is 0-60.
    const stats = statsFor(
      [event('PLAY', 0, 0), event('SEEK', 10, 60, 60), event('PAUSE', 40, 90)],
      600,
    );

    expect(stats.watchedSeconds).toBe(60);
    expect(stats.skippedSeconds).toBe(0);
    // Playback time still reflects the 90 seconds the player really ran.
    expect(stats.playbackSeconds).toBe(90);
  });

  it('treats several small forward hops as skipped, not watched', () => {
    const stats = statsFor(
      [
        event('PLAY', 0, 0),
        event('SEEK', 100, 10, 10),
        event('SEEK', 200, 20, 110),
        event('PAUSE', 210, 30),
      ],
      600,
    );

    expect(stats.watchedSeconds).toBe(30); // 0-10, 100-110, 200-210
    expect(stats.skippedSeconds).toBe(180); // 10-100 and 110-200
  });
});

describe('rewatching', () => {
  it('counts a rewatched section once', () => {
    const stats = statsFor(
      [
        event('PLAY', 0, 0),
        event('PAUSE', 60, 60),
        event('SEEK', 30, 61, 60),
        event('PLAY', 30, 62),
        event('PAUSE', 90, 122),
      ],
      600,
    );

    expect(stats.watchedSeconds).toBe(90); // union of 0-60 and 30-90
    expect(stats.playbackSeconds).toBe(120); // but 120 seconds really played
  });
});

describe('pause, tabs and abandonment', () => {
  it('ignores time spent paused', () => {
    const stats = statsFor(
      [
        event('PLAY', 0, 0),
        event('PAUSE', 30, 30),
        event('PLAY', 30, 300), // paused for four and a half minutes
        event('PAUSE', 60, 330),
      ],
      600,
    );

    expect(stats.watchedSeconds).toBe(60);
  });

  it('does not count audio that played while the tab was hidden', () => {
    const stats = statsFor(
      [
        event('PLAY', 0, 0),
        event('TAB_HIDDEN', 30, 30),
        event('TAB_VISIBLE', 90, 90),
        event('PAUSE', 120, 120),
      ],
      600,
    );

    expect(stats.watchedSeconds).toBe(60); // 0-30 and 90-120
  });

  it('does not call an abandoned video "skipped"', () => {
    // Ten honest minutes of a sixty minute video, then the user leaves.
    const stats = statsFor(
      [event('PLAY', 0, 0), event('PAUSE', 10 * MINUTE, 10 * MINUTE)],
      60 * MINUTE,
    );

    expect(stats.watchedSeconds).toBe(10 * MINUTE);
    expect(stats.skippedSeconds).toBe(0);
    expect(stats.remainingSeconds).toBe(50 * MINUTE);
  });

  it('keeps the watched time up to the last heartbeat when a tab is killed', () => {
    // PLAY then heartbeats, and nothing else — the tab died.
    const stats = statsFor(
      [event('PLAY', 0, 0), event('HEARTBEAT', 5, 5), event('HEARTBEAT', 10, 10)],
      600,
    );

    expect(stats.watchedSeconds).toBe(10);
  });
});

describe('guarding against lost events', () => {
  it('clamps a span whose seek event never arrived', () => {
    // The browser dropped the SEEK, so the raw events claim 3300 seconds of
    // video played in 120 seconds of wall-clock time. Physics says otherwise.
    const stats = statsFor([event('PLAY', 0, 0), event('PAUSE', 3300, 120)], 3600);

    expect(stats.watchedSeconds).toBeLessThanOrEqual(310);
    expect(stats.watchedSeconds).toBeGreaterThan(0);
  });

  it('ignores an interval that ends before it starts', () => {
    const stats = statsFor([event('PLAY', 100, 0), event('PAUSE', 50, 10)], 600);
    expect(stats.watchedSeconds).toBe(0);
  });

  it('clamps positions that exceed the reported duration', () => {
    const stats = statsFor([event('PLAY', 0, 0), event('PAUSE', 700, 600)], 600);
    expect(stats.watchedSeconds).toBe(600);
    expect(stats.reachedEnd).toBe(true);
  });
});

describe('multiple sessions for the same video', () => {
  it('merges overlapping sessions instead of adding them up', () => {
    const sessions = new Map<number, RawEvent[]>([
      // Monday: 0-10 minutes.
      [1, [event('PLAY', 0, 0), event('PAUSE', 10 * MINUTE, 10 * MINUTE)]],
      // Tuesday: rejoins at 5 minutes and goes to 20.
      [2, [event('PLAY', 5 * MINUTE, 0), event('PAUSE', 20 * MINUTE, 15 * MINUTE)]],
    ]);

    const stats = statsForVideo(sessions, 60 * MINUTE);

    expect(stats.watchedSeconds).toBe(20 * MINUTE); // not 25
    expect(stats.reachedSeconds).toBe(20 * MINUTE);
    expect(stats.skippedSeconds).toBe(0);
  });

  it('does not let one session leak state into another', () => {
    // Session 1 ends mid-play (tab closed). Session 2 must start fresh rather
    // than treating session 1's open span as still running.
    const sessions = new Map<number, RawEvent[]>([
      [1, [event('PLAY', 0, 0), event('HEARTBEAT', 30, 30)]],
      [2, [event('PLAY', 600, 0), event('PAUSE', 630, 30)]],
    ]);

    const stats = statsForVideo(sessions, 1200);

    expect(stats.watchedSeconds).toBe(60); // 0-30 and 600-630
    expect(stats.skippedSeconds).toBe(570); // the untouched 30-600
  });
});

describe('interval helpers', () => {
  it('merges overlapping and touching spans', () => {
    expect(
      mergeIntervals([
        { start: 0, end: 10 },
        { start: 5, end: 20 },
        { start: 20, end: 25 },
        { start: 40, end: 50 },
      ]),
    ).toEqual([
      { start: 0, end: 25 },
      { start: 40, end: 50 },
    ]);
  });

  it('counts overlapping spans once', () => {
    expect(
      unionLength([
        { start: 0, end: 10 },
        { start: 0, end: 10 },
      ]),
    ).toBe(10);
  });

  it('drops empty and inverted spans', () => {
    expect(unionLength([{ start: 10, end: 10 }, { start: 30, end: 20 }])).toBe(0);
  });
});
