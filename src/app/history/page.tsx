import { HistoryTable } from '@/components/HistoryTable';
import { guardSection, SectionHeading } from '@/lib/page-guard';

export const dynamic = 'force-dynamic';

export default async function HistoryPage() {
  const fallback = await guardSection();
  if (fallback) return fallback;

  return (
    <div className="space-y-4">
      <SectionHeading
        title="History"
        description="All-time totals per video. Sessions for the same video are merged, so rewatching a section does not count twice."
      />
      <HistoryTable />
    </div>
  );
}
