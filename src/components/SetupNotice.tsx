/**
 * Shown instead of a stack trace when DATABASE_URL or SESSION_SECRET are
 * missing — the first thing anyone sees on a fresh clone.
 */
export function SetupNotice({ detail }: { detail?: string }) {
  return (
    <div className="mx-auto max-w-xl space-y-4 pt-10">
      <h1 className="text-2xl font-semibold tracking-tight">Almost there</h1>
      <p className="text-sm text-muted">
        WatchLens needs a database and a session secret before it can run.
      </p>

      <ol className="card space-y-3 p-5 text-sm">
        <li>
          <span className="font-medium">1.</span> Copy the example env file:
          <pre className="mt-1 overflow-x-auto rounded-lg bg-canvas p-3 text-xs">
            cp .env.example .env.local
          </pre>
        </li>
        <li>
          <span className="font-medium">2.</span> Set <code>DATABASE_URL</code> to any Postgres
          instance and <code>SESSION_SECRET</code> to a long random string.
        </li>
        <li>
          <span className="font-medium">3.</span> Create the tables:
          <pre className="mt-1 overflow-x-auto rounded-lg bg-canvas p-3 text-xs">
            npm run db:migrate
          </pre>
        </li>
        <li>
          <span className="font-medium">4.</span> Restart <code>npm run dev</code>.
        </li>
      </ol>

      {detail && <p className="text-xs text-muted">Details: {detail}</p>}
    </div>
  );
}
