import type { Metadata } from 'next';
import { Bricolage_Grotesque, IBM_Plex_Mono, IBM_Plex_Sans } from 'next/font/google';

import { AppShell } from '@/components/AppShell';
import { Nav } from '@/components/Nav';
import { getCurrentUser } from '@/lib/auth';

import './globals.css';

/*
 * Three faces, three jobs.
 *
 * Bricolage carries the headings and the hero measurements — it has enough
 * character to keep the interface from reading as a stock dashboard. Plex Sans
 * runs the UI, and Plex Mono is reserved for anything the eye has to compare:
 * timecodes, durations, axis ticks. Mono there is functional, not stylistic —
 * tabular digits are why a ticking timecode does not jitter.
 *
 * Self-hosted through next/font, so there is no render-blocking request to a
 * font CDN in front of the player.
 */
const bricolage = Bricolage_Grotesque({
  subsets: ['latin'],
  weight: ['600', '700'],
  variable: '--font-bricolage',
  display: 'swap',
});

const plexSans = IBM_Plex_Sans({
  subsets: ['latin'],
  weight: ['400', '500', '600'],
  variable: '--font-plex-sans',
  display: 'swap',
});

const plexMono = IBM_Plex_Mono({
  subsets: ['latin'],
  weight: ['400', '500'],
  variable: '--font-plex-mono',
  display: 'swap',
});

/**
 * Resolves the theme before the first paint.
 *
 * This has to be a blocking inline script in <head>: if the palette were
 * applied by React after hydration, a light-theme user would see a flash of the
 * dark ground on every navigation. It reads the stored choice, falls back to
 * the OS preference, and stamps a concrete value — so the CSS never has to
 * guess, and `data-theme` is always present.
 *
 * Kept deliberately tiny and dependency-free. It is a static string with no
 * interpolation, so there is nothing user-controlled to inject.
 */
const THEME_BOOT = `(function(){try{var t=localStorage.getItem('watchlens.theme');if(t!=='light'&&t!=='dark'){t=window.matchMedia('(prefers-color-scheme: light)').matches?'light':'dark';}document.documentElement.setAttribute('data-theme',t);}catch(e){document.documentElement.setAttribute('data-theme','dark');}})();`;

export const metadata: Metadata = {
  title: 'WatchLens — YouTube Learning Time Tracker',
  description:
    'Watch YouTube here and see how much of each video you actually watched, not how much of it played.',
};

export default async function RootLayout({ children }: { children: React.ReactNode }) {
  // The shell must render even before the database or SESSION_SECRET are
  // configured, otherwise a fresh clone shows a stack trace instead of the
  // setup instructions.
  let email: string | null = null;
  try {
    email = (await getCurrentUser())?.email ?? null;
  } catch {
    email = null;
  }

  return (
    <html
      lang="en"
      className={`${bricolage.variable} ${plexSans.variable} ${plexMono.variable}`}
      // The boot script sets this before paint; declaring it here keeps the
      // server and client markup identical so React does not warn.
      suppressHydrationWarning
    >
      <head>
        <script dangerouslySetInnerHTML={{ __html: THEME_BOOT }} />
      </head>
      <body className="min-h-screen">
        <Nav email={email} />
        {/*
          AppShell owns the YouTube player. Keeping it in the layout rather than
          in a page is the whole reason the video survives navigating to History
          and back — layouts are not unmounted when the routed segment changes.
        */}
        <AppShell signedIn={email !== null}>{children}</AppShell>
      </body>
    </html>
  );
}
