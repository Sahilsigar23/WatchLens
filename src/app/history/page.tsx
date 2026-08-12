import { HistoryTable } from '@/components/HistoryTable';
import { SetupNotice } from '@/components/SetupNotice';
import { SignInCard } from '@/components/SignInCard';
import { getCurrentUserId } from '@/lib/auth';

export const dynamic = 'force-dynamic';

export default async function HistoryPage() {
  let userId: number | null;
  try {
    userId = await getCurrentUserId();
  } catch (error) {
    return <SetupNotice detail={error instanceof Error ? error.message : undefined} />;
  }

  if (userId === null) return <SignInCard />;

  return (
    <div className="space-y-4">
      <div>
        <h1 className="text-xl font-semibold tracking-tight">History</h1>
        <p className="mt-1 text-sm text-muted">
          All-time totals per video. Sessions for the same video are merged, so rewatching a section
          does not count twice.
        </p>
      </div>
      <HistoryTable />
    </div>
  );
}
