import { TodayPanel } from '@/components/TodayPanel';
import { getCurrentUser } from '@/lib/auth';
import { guardSection } from '@/lib/page-guard';

export const dynamic = 'force-dynamic';

export default async function TodayPage() {
  const fallback = await guardSection();
  if (fallback) return fallback;

  // The part of the address before the @ is the friendliest name available
  // without asking for one.
  const user = await getCurrentUser();
  const name = user?.email.split('@')[0] ?? '';

  return <TodayPanel name={name} />;
}
