import { describe, expect, it } from 'vitest';

import type { VideoCoverage } from '@/lib/analytics';
import { parseIsoDuration } from '@/lib/playlist-meta';
import { resumeIndexFor, summarizePlaylist, type PlaylistMetaItem } from '@/lib/playlist-progress';
import { parsePlaylistId } from '@/lib/youtube';

const MINUTE = 60;

function meta(id: string, title: string, durationSeconds: number): PlaylistMetaItem {
  return { youtubeVideoId: id, title, channelName: 'Course Channel', durationSeconds };
}

/** Coverage as if the user watched `[0, watched)` with nothing skipped. */
function watched(seconds: number, durationSeconds = 0): VideoCoverage {
  return { intervals: [{ start: 0, end: seconds }], reachedEnd: false, durationSeconds };
}

describe('playlist progress', () => {
  const items = [
    meta('aaaaaaaaaaa', 'Variables', 20 * MINUTE),
    meta('bbbbbbbbbbb', 'Lists', 35 * MINUTE),
    meta('ccccccccccc', 'Dictionaries', 30 * MINUTE),
    meta('ddddddddddd', 'Sets', 15 * MINUTE),
  ];

  const coverage = new Map<string, VideoCoverage>([
    ['aaaaaaaaaaa', watched(18 * MINUTE)],
    ['bbbbbbbbbbb', watched(12 * MINUTE)],
  ]);

  it('reports per-video watched time and percentage', () => {
    const { items: rows } = summarizePlaylist(items, coverage);

    expect(rows[0].watchedSeconds).toBe(18 * MINUTE);
    expect(rows[0].watchedPercentage).toBeCloseTo(0.9, 4);
    expect(rows[1].watchedSeconds).toBe(12 * MINUTE);
    expect(rows[1].watchedPercentage).toBeCloseTo(12 / 35, 4);
  });

  it('classifies each video as completed, in progress or not started', () => {
    const { items: rows } = summarizePlaylist(items, coverage);

    expect(rows.map((r) => r.status)).toEqual([
      'COMPLETED', // 90% clears the completion threshold
      'IN_PROGRESS',
      'NOT_STARTED',
      'NOT_STARTED',
    ]);
  });

  it('aggregates the playlist panel figures', () => {
    const { analytics } = summarizePlaylist(items, coverage);

    expect(analytics.videoCount).toBe(4);
    expect(analytics.completed).toBe(1);
    expect(analytics.inProgress).toBe(1);
    expect(analytics.notStarted).toBe(2);
    expect(analytics.watchedSeconds).toBe(30 * MINUTE);
    expect(analytics.totalDurationSeconds).toBe(100 * MINUTE);
    expect(analytics.progress).toBeCloseTo(0.3, 4);
    expect(analytics.durationsIncomplete).toBe(false);
  });

  it('does not call a fast-forwarded video completed', () => {
    // Reached the very end, but only 7 of 60 minutes were actually watched.
    // Marking this "completed" would be the exact illusion the app exists to
    // dispel, so it stays in progress.
    const skimmed = new Map<string, VideoCoverage>([
      [
        'aaaaaaaaaaa',
        {
          intervals: [
            { start: 0, end: 2 * MINUTE },
            { start: 55 * MINUTE, end: 60 * MINUTE },
          ],
          reachedEnd: true,
          durationSeconds: 60 * MINUTE,
        },
      ],
    ]);

    const { items: rows, analytics } = summarizePlaylist(
      [meta('aaaaaaaaaaa', 'Lecture', 60 * MINUTE)],
      skimmed,
    );

    expect(rows[0].reachedEnd).toBe(true);
    expect(rows[0].status).toBe('IN_PROGRESS');
    expect(analytics.completed).toBe(0);
    expect(analytics.inProgress).toBe(1);
  });

  it('excludes fast-forwarded time from playlist totals', () => {
    // The brief's example, as one entry in a playlist: watch 0-2, jump to 55,
    // watch to 60 on an hour-long video.
    const skipper = new Map<string, VideoCoverage>([
      [
        'aaaaaaaaaaa',
        {
          intervals: [
            { start: 0, end: 2 * MINUTE },
            { start: 55 * MINUTE, end: 60 * MINUTE },
          ],
          reachedEnd: true,
          durationSeconds: 60 * MINUTE,
        },
      ],
    ]);

    const { analytics } = summarizePlaylist([meta('aaaaaaaaaaa', 'Lecture', 60 * MINUTE)], skipper);

    expect(analytics.watchedSeconds).toBe(7 * MINUTE);
    expect(analytics.skippedSeconds).toBe(53 * MINUTE);
    expect(analytics.progress).toBeCloseTo(7 / 60, 4);
  });

  it('falls back to the recorded duration when metadata has none', () => {
    // The keyless path: oEmbed gives no duration, but the video was played once
    // and the player reported one at the time.
    const { items: rows, analytics } = summarizePlaylist(
      [meta('aaaaaaaaaaa', 'Variables', 0)],
      new Map([['aaaaaaaaaaa', watched(300, 600)]]),
    );

    expect(rows[0].durationSeconds).toBe(600);
    expect(rows[0].watchedPercentage).toBeCloseTo(0.5, 4);
    expect(analytics.durationsIncomplete).toBe(false);
  });

  it('flags partial totals when a duration is still unknown', () => {
    const { analytics } = summarizePlaylist([meta('aaaaaaaaaaa', 'Variables', 0)], new Map());
    expect(analytics.durationsIncomplete).toBe(true);
    expect(analytics.progress).toBe(0);
  });

  it('counts a video watched across several sittings once', () => {
    const overlapping = new Map<string, VideoCoverage>([
      [
        'aaaaaaaaaaa',
        {
          intervals: [
            { start: 0, end: 10 * MINUTE },
            { start: 5 * MINUTE, end: 15 * MINUTE },
          ],
          reachedEnd: false,
          durationSeconds: 20 * MINUTE,
        },
      ],
    ]);

    const { analytics } = summarizePlaylist([meta('aaaaaaaaaaa', 'Variables', 20 * MINUTE)], overlapping);
    expect(analytics.watchedSeconds).toBe(15 * MINUTE); // not 20
  });
});

describe('resuming a playlist', () => {
  const { items } = summarizePlaylist(
    [meta('aaaaaaaaaaa', 'One', 600), meta('bbbbbbbbbbb', 'Two', 600)],
    new Map([['aaaaaaaaaaa', watched(600)]]),
  );

  it('moves past a video the user already finished', () => {
    expect(items[0].status).toBe('COMPLETED');
    expect(resumeIndexFor(items, 0)).toBe(1);
  });

  it('returns to a video still in progress', () => {
    expect(resumeIndexFor(items, 1)).toBe(1);
  });

  it('ignores an index that no longer exists', () => {
    expect(resumeIndexFor(items, 99)).toBeNull();
    expect(resumeIndexFor(items, null)).toBeNull();
  });
});

describe('playlist url parsing', () => {
  it('accepts the usual forms', () => {
    expect(parsePlaylistId('https://www.youtube.com/playlist?list=PLabcdefghijkl')).toBe(
      'PLabcdefghijkl',
    );
    expect(parsePlaylistId('https://www.youtube.com/watch?v=aircAruvnKk&list=PLabcdefghijkl')).toBe(
      'PLabcdefghijkl',
    );
    expect(parsePlaylistId('PLabcdefghijkl')).toBe('PLabcdefghijkl');
  });

  it('rejects auto-generated mixes, which cannot be embedded', () => {
    expect(parsePlaylistId('https://www.youtube.com/watch?v=aircAruvnKk&list=RDaircAruvnKk')).toBeNull();
  });

  it('rejects plain video links and nonsense', () => {
    expect(parsePlaylistId('https://www.youtube.com/watch?v=aircAruvnKk')).toBeNull();
    expect(parsePlaylistId('https://vimeo.com/watch?list=PLabcdefghijkl')).toBeNull();
    expect(parsePlaylistId('')).toBeNull();
  });
});

describe('ISO 8601 durations', () => {
  it('parses the shapes the Data API returns', () => {
    expect(parseIsoDuration('PT1H2M3S')).toBe(3723);
    expect(parseIsoDuration('PT18M40S')).toBe(1120);
    expect(parseIsoDuration('PT45S')).toBe(45);
    expect(parseIsoDuration('PT2H')).toBe(7200);
  });

  it('returns 0 for values it cannot use', () => {
    expect(parseIsoDuration('P0D')).toBe(0); // live stream
    expect(parseIsoDuration('')).toBe(0);
  });
});
