import { PlaylistsPanel } from '@/components/PlaylistsPanel';
import { guardSection, SectionHeading } from '@/lib/page-guard';

export const dynamic = 'force-dynamic';

export default async function PlaylistsPage() {
  const fallback = await guardSection();
  if (fallback) return fallback;

  return (
    <div className="space-y-4">
      <SectionHeading
        title="Playlists"
        description="Every playlist you have opened, with real progress. Continue picks up at the video you stopped on."
      />
      <PlaylistsPanel />
    </div>
  );
}
