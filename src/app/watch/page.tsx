import { guardSection } from '@/lib/page-guard';

export const dynamic = 'force-dynamic';

/**
 * `/watch` — the watching surface.
 *
 * Deliberately almost empty: the search box, player, playlist sidebar and video
 * information are all rendered by PlayerShell inside the layout, which is what
 * keeps them alive across navigation. Putting them in this page instead would
 * unmount the iframe every time the user visited another section.
 *
 * This is the one route where PlayerShell lays the player out full size;
 * everywhere else the same DOM node is restyled into the corner mini-player.
 * Analytics live in their own sections (/today, /weekly, /history, /playlists)
 * so this page stays a watching surface rather than a dashboard.
 */
export default async function WatchPage() {
  return (await guardSection()) ?? null;
}
