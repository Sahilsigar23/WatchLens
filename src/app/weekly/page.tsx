import { WeeklyPanel } from '@/components/WeeklyPanel';
import { guardSection } from '@/lib/page-guard';

export const dynamic = 'force-dynamic';

export default async function WeeklyPage() {
  const fallback = await guardSection();
  if (fallback) return fallback;

  return <WeeklyPanel />;
}
