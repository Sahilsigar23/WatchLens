'use client';

import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';

import { Icon, Logo, type IconName } from '@/components/Icon';
import { clearPlayerState } from '@/lib/player-state';

/**
 * Every section is a route, so moving between them is client-side navigation
 * and the player in the layout is never unmounted. See AppShell.
 */
const LINKS: { href: string; label: string; icon: IconName }[] = [
  { href: '/', label: 'Watch', icon: 'play' },
  { href: '/today', label: 'Today', icon: 'clock' },
  { href: '/weekly', label: 'Weekly', icon: 'calendar' },
  { href: '/history', label: 'History', icon: 'history' },
  { href: '/playlists', label: 'Playlists', icon: 'list' },
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

  const isActive = (href: string) => pathname === href;

  return (
    <>
      <header className="sticky top-0 z-30 border-b border-line bg-canvas/80 backdrop-blur-xl">
        <div className="mx-auto flex h-16 w-full max-w-6xl items-center gap-6 px-4 sm:px-6">
          <Link href="/" className="flex h-11 shrink-0 items-center gap-2.5">
            <Logo />
            <span className="text-[0.95rem] font-semibold tracking-tight">WatchLens</span>
          </Link>

          {email && (
            // Desktop only — the mobile tab bar below carries these instead, so
            // the header never has to scroll sideways.
            <nav className="hidden items-center gap-1 md:flex">
              {LINKS.map((link) => (
                <Link
                  key={link.href}
                  href={link.href}
                  aria-current={isActive(link.href) ? 'page' : undefined}
                  className={`relative rounded-lg px-3 py-2 text-sm transition-colors ${
                    isActive(link.href) ? 'text-ink' : 'text-muted hover:text-ink'
                  }`}
                >
                  {link.label}
                  {/*
                    The active indicator. Rendered on every item and only made
                    visible on the current one, so it is a width/opacity
                    transition rather than an element appearing from nowhere.
                  */}
                  <span
                    aria-hidden
                    className={`absolute inset-x-3 -bottom-px h-0.5 rounded-full transition-all duration-200 ${
                      isActive(link.href) ? 'opacity-100' : 'scale-x-0 opacity-0'
                    }`}
                    style={{
                      backgroundImage:
                        'linear-gradient(90deg, var(--color-brand), var(--color-accent))',
                    }}
                  />
                </Link>
              ))}
            </nav>
          )}

          {email && (
            <div className="ml-auto flex shrink-0 items-center gap-2">
              <Link
                href="/settings"
                aria-label="Settings"
                aria-current={isActive('/settings') ? 'page' : undefined}
                title={email}
                className={`grid h-10 w-10 place-items-center rounded-full border transition-colors ${
                  isActive('/settings')
                    ? 'border-brand text-ink'
                    : 'border-line text-muted hover:text-ink'
                }`}
              >
                <span className="text-xs font-semibold uppercase">{email.slice(0, 1)}</span>
              </Link>
              <button type="button" onClick={signOut} className="btn btn-ghost hidden sm:inline-flex">
                Sign out
              </button>
            </div>
          )}
        </div>
      </header>

      {/*
        Mobile navigation. A bottom tab bar rather than a menu: it is reachable
        one-handed and, unlike a scrolling row of links, nothing is hidden.
        PlayerShell offsets the mini-player above it so the two never overlap.
      */}
      {email && (
        <nav className="fixed inset-x-0 bottom-0 z-30 border-t border-line bg-canvas/95 backdrop-blur-xl md:hidden">
          <ul className="mx-auto flex max-w-md items-stretch justify-between px-2 pb-[env(safe-area-inset-bottom)]">
            {LINKS.map((link) => (
              <li key={link.href} className="flex-1">
                <Link
                  href={link.href}
                  aria-current={isActive(link.href) ? 'page' : undefined}
                  className={`flex flex-col items-center gap-1 py-2.5 text-[0.65rem] font-medium transition-colors ${
                    isActive(link.href) ? 'text-ink' : 'text-muted'
                  }`}
                >
                  <span
                    className={`grid h-8 w-12 place-items-center rounded-full transition-colors ${
                      isActive(link.href) ? 'bg-surface' : ''
                    }`}
                    style={
                      isActive(link.href)
                        ? {
                            backgroundImage:
                              'linear-gradient(135deg, color-mix(in oklab, var(--color-brand) 26%, transparent), color-mix(in oklab, var(--color-accent) 20%, transparent))',
                          }
                        : undefined
                    }
                  >
                    <Icon name={link.icon} size={17} />
                  </span>
                  {link.label}
                </Link>
              </li>
            ))}
          </ul>
        </nav>
      )}
    </>
  );
}
