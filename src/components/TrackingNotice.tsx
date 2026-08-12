import Link from 'next/link';

/**
 * Always-visible disclosure of what is being recorded. Nothing is tracked that
 * is not listed here, and the list is the same one /privacy shows in full.
 */
export function TrackingNotice() {
  return (
    <div className="card p-4 text-sm">
      <p className="font-medium">While a video plays, WatchLens records:</p>
      <p className="mt-1 text-muted">
        the video id, title, channel and length; play, pause, seek and end events with their
        positions; whether this tab is in the foreground; and when the session started and ended.
      </p>
      <p className="mt-2 text-muted">
        It does not record what you type, other tabs, your camera, microphone, or anything outside
        this page. <Link href="/privacy" className="underline underline-offset-2 hover:text-ink">
          Read the full policy or delete your data
        </Link>
        .
      </p>
    </div>
  );
}
