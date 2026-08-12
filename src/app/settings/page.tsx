import Link from 'next/link';

import { DataControls } from '@/components/DataControls';
import { TrackingNotice } from '@/components/TrackingNotice';
import { getCurrentUser } from '@/lib/auth';
import { guardSection, SectionHeading } from '@/lib/page-guard';

export const dynamic = 'force-dynamic';

export default async function SettingsPage() {
  const fallback = await guardSection();
  if (fallback) return fallback;

  const user = await getCurrentUser();

  return (
    <div className="max-w-3xl space-y-6">
      <SectionHeading
        title="Settings"
        description="Your account, what WatchLens records, and how to delete it."
      />

      <section className="card p-5">
        <h2 className="text-sm font-semibold">Account</h2>
        <dl className="mt-3 space-y-1.5 text-sm">
          <div className="flex justify-between gap-4">
            <dt className="text-muted">Email</dt>
            <dd className="truncate font-medium">{user?.email}</dd>
          </div>
          <div className="flex justify-between gap-4">
            <dt className="text-muted">Password</dt>
            <dd className="font-medium">Set</dd>
          </div>
        </dl>
        <p className="mt-3 text-xs text-muted">
          There is no password reset — that needs a mail provider this app does not have. Sign out
          from the top navigation.
        </p>
      </section>

      <section className="space-y-3">
        <h2 className="text-sm font-semibold">Tracking</h2>
        <TrackingNotice />
        <p className="text-sm text-muted">
          The{' '}
          <Link href="/privacy" className="underline underline-offset-2 hover:text-ink">
            full privacy policy
          </Link>{' '}
          lists everything recorded and everything that is not.
        </p>
      </section>

      <DataControls />
    </div>
  );
}
