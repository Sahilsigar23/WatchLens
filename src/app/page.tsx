import { DashboardStats } from '@/components/DashboardStats';
import { SetupNotice } from '@/components/SetupNotice';
import { SignInCard } from '@/components/SignInCard';
import { getCurrentUserId } from '@/lib/auth';

export const dynamic = 'force-dynamic';

/**
 * The Watch page is only the analytics below the player — the player, the
 * search box and the playlist all live in the layout's AppShell so they survive
 * navigation. See src/components/PlayerShell.tsx.
 */
export default async function HomePage() {
  let userId: number | null;
  try {
    userId = await getCurrentUserId();
  } catch (error) {
    return <SetupNotice detail={error instanceof Error ? error.message : undefined} />;
  }

  return userId === null ? <SignInCard /> : <DashboardStats />;
}
