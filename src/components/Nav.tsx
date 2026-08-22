'use client';

import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';

import { Icon, Logo, type IconName } from '@/components/Icon';
import { ThemeToggle } from '@/components/ThemeToggle';
import { clearPlayerState } from '@/lib/player-state';

/**
 * Every section is a route, so moving between them is client-side navigation
 * and the player in the layout is never unmounted. See AppShell.
 *
 * Watch, Today and Weekly are the product's three surfaces; History and
 * Playlists are the drill-downs behind them. The order is the order of use.
 */
const LINKS: { href: string; label: string; icon: IconName }[] = [
  // `/watch`, not `/` — the brand mark owns `/` (the landing page), so the
  // Watch tab points at the player surface itself.
  { href: '/watch', label: 'Watch', icon: 'play' },
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
      <header className="sticky top-0 z-30 border-b border-rule bg-ground/85 backdrop-blur-xl">
        <div className="shell flex h-14 items-center gap-3 sm:gap-4">
          {/* `min-h-11` gives the brand a 44px tap target inside the 56px
              header — the mark itself is only 28px, which is comfortable to
              click but small to thumb. */}
          <Link href="/" className="flex min-h-11 shrink-0 items-center gap-2.5">
            <Logo />
            <span className="display text-[0.9375rem] tracking-tight">WatchLens</span>
          </Link>

          {email && (
            /*
             * From `lg` only. Five labelled links plus the brand, sign-out, the
             * theme toggle and the avatar do not fit a 768px header without
             * shrinking the labels to nothing — so tablets keep the bottom tab
             * bar, which is a better pattern at that size anyway. Below `lg`
             * this rail is absent rather than scrollable: nothing is hidden.
             */
            <nav className="ml-2 hidden items-center rounded-lg border border-rule p-0.5 lg:flex">
              {LINKS.map((link) => (
                <Link
                  key={link.href}
                  href={link.href}
                  aria-current={isActive(link.href) ? 'page' : undefined}
                  className={`flex items-center gap-2 rounded-[0.3125rem] px-3 py-1.5 text-[0.8125rem] transition-colors ${
                    isActive(link.href)
                      ? 'bg-panel-2 text-text'
                      : 'text-dim hover:text-text'
                  }`}
                >
                  {/* The active marker is a sodium tick, not an underline —
                      one accent, used the same way everywhere. */}
                  <span
                    aria-hidden
                    className={`h-1 w-1 rounded-full transition-colors ${
                      isActive(link.href) ? 'bg-signal' : 'bg-transparent'
                    }`}
                  />
                  {link.label}
                </Link>
              ))}
            </nav>
          )}

          <div className="ml-auto flex shrink-0 items-center gap-2">
            {/* Available signed out too — the sign-in screen should honour the
                chosen theme like everything else. */}
            <ThemeToggle />

            {email && (
              <>
                <button
                  type="button"
                  onClick={signOut}
                  className="btn btn-quiet hidden h-9 min-h-0 sm:inline-flex"
                >
                  Sign out
                </button>
                <Link
                  href="/settings"
                  aria-label="Settings"
                  aria-current={isActive('/settings') ? 'page' : undefined}
                  title={email}
                  className={`data grid h-9 w-9 place-items-center rounded-lg border text-xs uppercase transition-colors ${
                    isActive('/settings')
                      ? 'border-signal text-signal'
                      : 'border-rule text-dim hover:text-text'
                  }`}
                >
                  {email.slice(0, 1)}
                </Link>
              </>
            )}
          </div>
        </div>
      </header>

      {/*
        Phone and tablet navigation. A bottom tab bar rather than a menu: it is
        reachable one-handed and, unlike a scrolling row of links, nothing is
        hidden behind a tap. PlayerShell offsets the mini-player above it so the
        two never overlap. Hidden from `lg`, where the header rail takes over.
      */}
      {email && (
        <nav className="fixed inset-x-0 bottom-0 z-30 border-t border-rule bg-ground/95 backdrop-blur-xl lg:hidden">
          <ul className="mx-auto flex max-w-md items-stretch justify-between px-1 pb-[env(safe-area-inset-bottom)]">
            {LINKS.map((link) => (
              <li key={link.href} className="flex-1">
                <Link
                  href={link.href}
                  aria-current={isActive(link.href) ? 'page' : undefined}
                  /* 56px min target: comfortably above the 44px floor. */
                  className={`flex min-h-14 flex-col items-center justify-center gap-1 text-[0.625rem] font-medium transition-colors ${
                    isActive(link.href) ? 'text-text' : 'text-dim'
                  }`}
                >
                  <span className={isActive(link.href) ? 'text-signal' : ''}>
                    <Icon name={link.icon} size={18} />
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
