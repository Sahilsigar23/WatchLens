import { LandingSurface } from '@/components/LandingSurface';
import { guardSection } from '@/lib/page-guard';

export const dynamic = 'force-dynamic';

/**
 * `/` — the landing page, and where the WatchLens mark points.
 *
 * It is a real destination rather than an alias for the player: the coverage
 * figure that explains the product, the input, and what you were last watching.
 * A video already open stays open in the corner mini-player while you are here,
 * because the player is mounted by the layout and survives navigation.
 *
 * The full-size player lives at `/watch`.
 */
export default async function LandingPage() {
  return (await guardSection()) ?? <LandingSurface />;
}
