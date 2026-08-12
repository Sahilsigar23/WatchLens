import { SetupNotice } from '@/components/SetupNotice';
import { SignInCard } from '@/components/SignInCard';
import { WatchDashboard } from '@/components/WatchDashboard';
import { getCurrentUserId } from '@/lib/auth';

export const dynamic = 'force-dynamic';

export default async function HomePage() {
  let userId: number | null;
  try {
    userId = await getCurrentUserId();
  } catch (error) {
    return <SetupNotice detail={error instanceof Error ? error.message : undefined} />;
  }

  return userId === null ? <SignInCard /> : <WatchDashboard />;
}
