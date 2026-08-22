import Link from 'next/link';

import { DataControls } from '@/components/DataControls';
import { SignOutButton } from '@/components/SignOutButton';
import { TrackingNotice } from '@/components/TrackingNotice';
import { getCurrentUser } from '@/lib/auth';
import { guardSection, SectionHeading } from '@/lib/page-guard';

export const dynamic = 'force-dynamic';

export default async function SettingsPage() {
  const fallback = await guardSection();
  if (fallback) return fallback;

  const user = await getCurrentUser();

  return (
    <div className="measure-wide space-y-6">
      <SectionHeading
        title="Settings"
        description="Your account, what WatchLens records, and how to delete it."
      />

      <section className="panel p-5">
        <h2 className="display text-base">Account</h2>
        <dl className="mt-3 space-y-2 text-sm">
          <div className="flex justify-between gap-4">
            <dt className="text-dim">Email</dt>
            <dd className="truncate font-medium">{user?.email}</dd>
          </div>
          <div className="flex justify-between gap-4">
            <dt className="text-dim">Password</dt>
            <dd className="font-medium">Set</dd>
          </div>
        </dl>

        <div className="mt-4 flex flex-wrap items-center gap-3 border-t border-rule pt-4">
          <SignOutButton />
          <p className="text-xs text-dim">
            Signing out keeps your history — nothing is deleted.
          </p>
        </div>

        <p className="mt-3 text-xs text-dim">
          There is no password reset; that needs a mail provider this app does not have.
        </p>
      </section>

      <section className="space-y-3">
        <h2 className="display text-base">Tracking</h2>
        <TrackingNotice />
        <p className="text-sm text-dim">
          The{' '}
          <Link href="/privacy" className="underline underline-offset-2 hover:text-text">
            full privacy policy
          </Link>{' '}
          lists everything recorded and everything that is not.
        </p>
      </section>

      <DataControls />
    </div>
  );
}
