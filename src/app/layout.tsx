import type { Metadata } from 'next';

import { Nav } from '@/components/Nav';
import { getCurrentUser } from '@/lib/auth';

import './globals.css';

export const metadata: Metadata = {
  title: 'StudyTrace — YouTube Learning Time Tracker',
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
    <html lang="en">
      <body className="min-h-screen">
        <Nav email={email} />
        <main className="mx-auto w-full max-w-6xl px-4 pb-16 pt-6 sm:px-6">{children}</main>
      </body>
    </html>
  );
}
