import { TodayPanel } from '@/components/TodayPanel';
import { guardSection, SectionHeading } from '@/lib/page-guard';

export const dynamic = 'force-dynamic';

export default async function TodayPage() {
  const fallback = await guardSection();
  if (fallback) return fallback;

  return (
    <div className="space-y-4">
      <SectionHeading
        title="Today"
        description="Actual watch time, study and entertainment time, and what you skipped — for today in your timezone."
      />
      <TodayPanel />
    </div>
  );
}
