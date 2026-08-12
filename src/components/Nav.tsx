'use client';

import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';

const LINKS = [
  { href: '/', label: 'Watch' },
  { href: '/history', label: 'History' },
  { href: '/privacy', label: 'Privacy' },
];

export function Nav({ email }: { email: string | null }) {
  const pathname = usePathname();
  const router = useRouter();

  const signOut = async () => {
    await fetch('/api/auth', { method: 'DELETE' });
    router.refresh();
  };

  return (
    <header className="sticky top-0 z-20 border-b border-line bg-surface/90 backdrop-blur">
      {/* Wraps on narrow screens: logo and Sign out stay on the first row and
          the links drop to a second one, rather than overflowing the viewport. */}
      <div className="mx-auto flex w-full max-w-6xl flex-wrap items-center gap-x-4 gap-y-2 px-4 py-3 sm:flex-nowrap sm:px-6">
        <Link href="/" className="flex shrink-0 items-center gap-2">
          <span className="grid h-7 w-7 place-items-center rounded-lg bg-brand text-sm font-bold text-white">
            S
          </span>
          <span className="text-base font-semibold tracking-tight">StudyTrace</span>
        </Link>

        <nav className="order-3 flex w-full items-center gap-1 text-sm sm:order-none sm:w-auto">
          {LINKS.map((link) => {
            const active = pathname === link.href;
            return (
              <Link
                key={link.href}
                href={link.href}
                className={`rounded-lg px-3 py-1.5 transition-colors ${
                  active ? 'bg-canvas font-medium text-ink' : 'text-muted hover:text-ink'
                }`}
              >
                {link.label}
              </Link>
            );
          })}
        </nav>

        {email && (
          <div className="ml-auto flex shrink-0 items-center gap-3">
            <span className="hidden max-w-[16ch] truncate text-sm text-muted sm:block">
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
