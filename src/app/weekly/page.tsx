import { WeeklyPanel } from '@/components/WeeklyPanel';
import { guardSection, SectionHeading } from '@/lib/page-guard';

export const dynamic = 'force-dynamic';

export default async function WeeklyPage() {
  const fallback = await guardSection();
  if (fallback) return fallback;

  return (
    <div className="space-y-4">
      <SectionHeading
        title="Weekly activity"
        description="Monday to Sunday. Bar height is time you actually watched — skipped time is not part of the stack, because it was never watched."
      />
      <WeeklyPanel />
    </div>
  );
}
