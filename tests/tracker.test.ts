import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { EventTracker } from '@/lib/tracker';

/**
 * Buffering rules for the event tracker.
 *
 * The case that matters most is a failed session: events recorded while
 * `/api/session` was failing must never be adopted by the *next* video, or one
 * video's watch time gets credited to another. That is invisible in normal use
 * and only shows up when the API blips — exactly when nobody is looking.
 */

const originalFetch = globalThis.fetch;

beforeEach(() => {
  globalThis.fetch = vi.fn(async () => new Response('{}', { status: 200 })) as typeof fetch;
});

afterEach(() => {
  globalThis.fetch = originalFetch;
  vi.restoreAllMocks();
});

describe('session buffering', () => {
  it('adopts events recorded while the session id was still in flight', () => {
    const tracker = new EventTracker();
    tracker.beginSession();

    tracker.track('PLAY', 0);
    tracker.track('HEARTBEAT', 5);
    expect(tracker.pendingCount()).toBe(2);

    tracker.setSessionId(42);
    expect(tracker.pendingCount()).toBe(0);
  });

  it('drops events from a video whose session never opened', () => {
    const tracker = new EventTracker();

    // Video A: the session request failed, so these never got an id.
    tracker.beginSession();
    tracker.track('PLAY', 0);
    tracker.track('HEARTBEAT', 30);
    expect(tracker.pendingCount()).toBe(2);

    // Video B starts. A's orphans must not become B's.
    tracker.beginSession();
    expect(tracker.pendingCount()).toBe(0);

    tracker.track('PLAY', 0);
    tracker.setSessionId(7);
    expect(tracker.pendingCount()).toBe(0);
  });

  it('sends one batched request rather than one per event', async () => {
    const tracker = new EventTracker();
    tracker.beginSession();
    tracker.setSessionId(1);

    for (let i = 0; i < 5; i += 1) tracker.track('HEARTBEAT', i * 5);
    await tracker.flush();

    expect(globalThis.fetch).toHaveBeenCalledTimes(1);
    const [, init] = (globalThis.fetch as ReturnType<typeof vi.fn>).mock.calls[0];
    const body = JSON.parse((init as RequestInit).body as string) as { events: unknown[] };
    expect(body.events).toHaveLength(5);
  });

  it('keeps events buffered when the server is unreachable', async () => {
    globalThis.fetch = vi.fn(async () => {
      throw new Error('network down');
    }) as typeof fetch;

    const tracker = new EventTracker();
    tracker.beginSession();
    tracker.setSessionId(1);
    tracker.track('PLAY', 0);

    expect(await tracker.flush()).toBe(false);

    // Re-queued rather than lost, so the next flush can deliver them.
    globalThis.fetch = vi.fn(async () => new Response('{}', { status: 200 })) as typeof fetch;
    expect(await tracker.flush()).toBe(true);
    const [, init] = (globalThis.fetch as ReturnType<typeof vi.fn>).mock.calls[0];
    const body = JSON.parse((init as RequestInit).body as string) as { events: unknown[] };
    expect(body.events).toHaveLength(1);
  });

  it('drops a batch the server rejects outright', async () => {
    globalThis.fetch = vi.fn(async () => new Response('{}', { status: 400 })) as typeof fetch;

    const tracker = new EventTracker();
    tracker.beginSession();
    tracker.setSessionId(1);
    tracker.track('PLAY', 0);

    await tracker.flush();

    // A 400 will never succeed on retry; keeping it would wedge the queue.
    globalThis.fetch = vi.fn(async () => new Response('{}', { status: 200 })) as typeof fetch;
    await tracker.flush();
    expect(globalThis.fetch).not.toHaveBeenCalled();
  });
});
