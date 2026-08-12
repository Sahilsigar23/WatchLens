'use client';

import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';

import { clearPlayerState } from '@/lib/player-state';

/**
 * Every section is a route, so moving between them is client-side navigation
 * and the player in the layout is never unmounted. See AppShell.
 */
const LINKS = [
  { href: '/', label: 'Watch' },
  { href: '/history', label: 'History' },
  { href: '/today', label: 'Today' },
  { href: '/weekly', label: 'Weekly' },
  { href: '/playlists', label: 'Playlists' },
  { href: '/settings', label: 'Settings' },
];

export function Nav({ email }: { email: string | null }) {
  const pathname = usePathname();
  const router = useRouter();

  /**
   * Ends the authentication session only.
   *
   * Nothing is deleted: history, analytics, playlists and progress all stay in
   * the database against this account and come back on the next sign-in. The
   * only thing cleared is the browser's cached "which video was on screen",
   * so the next person to use this browser does not inherit it.
   */
  const signOut = async () => {
    await fetch('/api/auth', { method: 'DELETE' });
    clearPlayerState();
    router.refresh();
  };

  return (
    <header className="sticky top-0 z-20 border-b border-line bg-surface/90 backdrop-blur">
      <div className="mx-auto flex w-full max-w-6xl items-center gap-3 px-4 py-3 sm:gap-4 sm:px-6">
        <Link href="/" className="flex shrink-0 items-center gap-2">
          <span className="grid h-7 w-7 place-items-center rounded-lg bg-brand text-sm font-bold text-white">
            W
          </span>
          <span className="hidden text-base font-semibold tracking-tight sm:block">WatchLens</span>
        </Link>

        {email && (
          // Six sections will not fit a phone, so the row scrolls sideways
          // rather than wrapping into a second line that pushes the player down.
          <nav className="-mx-1 flex min-w-0 flex-1 items-center gap-1 overflow-x-auto px-1 text-sm [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
            {LINKS.map((link) => {
              const active = pathname === link.href;
              return (
                <Link
                  key={link.href}
                  href={link.href}
                  aria-current={active ? 'page' : undefined}
                  className={`shrink-0 whitespace-nowrap rounded-lg px-3 py-1.5 transition-colors ${
                    active ? 'bg-canvas font-medium text-ink' : 'text-muted hover:text-ink'
                  }`}
                >
                  {link.label}
                </Link>
              );
            })}
          </nav>
        )}

        {email && (
          <div className="ml-auto flex shrink-0 items-center gap-3">
            <span className="hidden max-w-[16ch] truncate text-sm text-muted lg:block">
              {email}
            </span>
            <button
              type="button"
              onClick={signOut}
              className="rounded-lg border border-line px-3 py-1.5 text-sm text-muted transition-colors hover:text-ink"
            >
              Sign out
            </button>
          </div>
        )}
      </div>
    </header>
  );
}
