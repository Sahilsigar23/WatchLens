import type { ReactElement } from 'react';

import { SetupNotice } from '@/components/SetupNotice';
import { SignInCard } from '@/components/SignInCard';
import { getCurrentUserId } from '@/lib/auth';

/**
 * The shared front door for every section.
 *
 * Returns a replacement element when the page should not render — setup
 * instructions if the app is unconfigured, the sign-in card if nobody is
 * signed in — and `null` when the caller should render normally.
 *
 * Each section still guards itself rather than relying on the layout: the
 * layout renders for unauthenticated visitors too, and a section that forgot
 * its own check would leak. The APIs behind these pages enforce ownership
 * independently, so this is about what is shown, not what is reachable.
 */
export async function guardSection(): Promise<ReactElement | null> {
  try {
    const userId = await getCurrentUserId();
    return userId === null ? <SignInCard /> : null;
  } catch (error) {
    return <SetupNotice detail={error instanceof Error ? error.message : undefined} />;
  }
}

/** Consistent page heading, matching the Today and Weekly sections. */
export function SectionHeading({ title, description }: { title: string; description: string }) {
  return (
    <header className="mb-6">
      <h1 className="text-2xl font-semibold tracking-tight sm:text-3xl">{title}</h1>
      <p className="mt-1 max-w-2xl text-sm text-muted">{description}</p>
    </header>
  );
}
