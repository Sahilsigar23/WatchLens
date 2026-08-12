import type { EventType, TrackedEvent } from './types';

/**
 * Browser-side event buffer.
 *
 * Design constraints, all of them about not disturbing playback:
 *  - `track()` is synchronous and does nothing but push onto an array, so it is
 *    safe to call from a player callback or a 250 ms poll.
 *  - Events leave in batches on a timer, never one request per second.
 *  - A failed flush puts the events back and playback carries on. Losing
 *    analytics is acceptable; interrupting the video is not.
 *  - The final flush uses `sendBeacon`, which the browser delivers after the
 *    page is gone — a normal fetch would be cancelled on unload.
 */

/** Flush cadence. Ten seconds keeps requests rare without risking much data. */
export const FLUSH_INTERVAL_MS = 10_000;

/** Flush early once the buffer reaches this many events. */
const MAX_BATCH = 25;

/**
 * Hard cap on the buffer. If the API has been down for a long time we drop the
 * oldest events rather than grow the array without bound — a tracker must never
 * be the reason a tab runs out of memory.
 */
const MAX_BUFFER = 500;

export class EventTracker {
  private buffer: TrackedEvent[] = [];
  private timer: ReturnType<typeof setInterval> | null = null;
  private inFlight = false;
  private sessionId: number | null = null;

  /** Set once the session row exists. Events tracked before then are held. */
  setSessionId(sessionId: number): void {
    this.sessionId = sessionId;
    for (const event of this.buffer) {
      if (event.sessionId === 0) event.sessionId = sessionId;
    }
  }

  start(): void {
    if (this.timer !== null) return;
    this.timer = setInterval(() => void this.flush(), FLUSH_INTERVAL_MS);
  }

  stop(): void {
    if (this.timer !== null) {
      clearInterval(this.timer);
      this.timer = null;
    }
  }

  /** Cheap and synchronous — safe to call from hot paths. */
  track(type: EventType, videoTime: number, previousVideoTime?: number): void {
    const event: TrackedEvent = {
      clientEventId: newId(),
      sessionId: this.sessionId ?? 0,
      type,
      videoTime: round(videoTime),
      timestamp: Date.now(),
    };
    if (previousVideoTime !== undefined) event.previousVideoTime = round(previousVideoTime);

    this.buffer.push(event);
    if (this.buffer.length > MAX_BUFFER) this.buffer.splice(0, this.buffer.length - MAX_BUFFER);
    if (this.buffer.length >= MAX_BATCH) void this.flush();
  }

  /**
   * Sends everything buffered. Never throws — the caller is playback code.
   * Returns false if the batch could not be delivered (it stays buffered).
   */
  async flush(): Promise<boolean> {
    if (this.inFlight || this.sessionId === null) return false;

    const batch = this.buffer.filter((e) => e.sessionId !== 0);
    if (batch.length === 0) return true;

    this.inFlight = true;
    this.buffer = this.buffer.filter((e) => e.sessionId === 0);

    try {
      const response = await fetch('/api/events', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ events: batch }),
        keepalive: true,
      });

      // 4xx means this batch will never be accepted — retrying forever would
      // wedge the buffer, so drop it. 5xx and network errors are transient.
      if (!response.ok && response.status >= 500) {
        this.requeue(batch);
        return false;
      }
      return response.ok;
    } catch {
      this.requeue(batch);
      return false;
    } finally {
      this.inFlight = false;
    }
  }

  /**
   * Last-gasp delivery on page unload. `sendBeacon` hands the request to the
   * browser, which sends it even after the document is torn down.
   */
  flushWithBeacon(): void {
    if (this.sessionId === null) return;

    const batch = this.buffer.filter((e) => e.sessionId !== 0);
    if (batch.length === 0) return;

    const payload = JSON.stringify({ events: batch });
    const sent =
      typeof navigator !== 'undefined' &&
      typeof navigator.sendBeacon === 'function' &&
      navigator.sendBeacon('/api/events', new Blob([payload], { type: 'application/json' }));

    if (sent) this.buffer = this.buffer.filter((e) => e.sessionId === 0);
    else void this.flush();
  }

  private requeue(batch: TrackedEvent[]): void {
    this.buffer = [...batch, ...this.buffer];
    if (this.buffer.length > MAX_BUFFER) this.buffer.splice(0, this.buffer.length - MAX_BUFFER);
  }
}

function newId(): string {
  if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
    return crypto.randomUUID();
  }
  return `${Date.now()}-${Math.random().toString(36).slice(2, 11)}`;
}

/** Milliseconds of player position are noise; three decimals is plenty. */
function round(value: number): number {
  return Number.isFinite(value) ? Math.round(value * 1000) / 1000 : 0;
}
