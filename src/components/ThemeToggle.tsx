'use client';

import { useCallback, useEffect, useState } from 'react';

import { Icon } from '@/components/Icon';

export type Theme = 'light' | 'dark';

/** Same key the boot script in `layout.tsx` reads before first paint. */
const THEME_KEY = 'watchlens.theme';

/**
 * How long the crossfade class stays on <html>. Matches the transition in
 * `globals.css`; the class is removed afterwards so the transition never
 * applies to ordinary hovers.
 */
const TRANSITION_MS = 240;

function readTheme(): Theme {
  if (typeof document === 'undefined') return 'dark';
  return document.documentElement.getAttribute('data-theme') === 'light' ? 'light' : 'dark';
}

/**
 * Dark / light switch for the header.
 *
 * The initial value comes from whatever the boot script already resolved — a
 * stored choice, or the OS preference on a first visit — so this component
 * never decides the theme on its own and there is nothing to flash. It only
 * flips and persists it.
 *
 * Deliberately two-state rather than a three-way light/dark/system menu: the
 * OS preference is already the default, and a third option that most people
 * never touch is not worth the extra control in a 56px header.
 */
export function ThemeToggle({ className = '' }: { className?: string }) {
  const [theme, setTheme] = useState<Theme>('dark');
  /*
   * The server cannot know the theme, so the icon would differ between the
   * server-rendered markup and the client's first render. Rendering a
   * placeholder until mounted keeps hydration clean without suppressing the
   * warning and hiding a real mismatch later.
   */
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    setTheme(readTheme());
    setMounted(true);
  }, []);

  const toggle = useCallback(() => {
    const next: Theme = readTheme() === 'dark' ? 'light' : 'dark';
    const root = document.documentElement;

    // Skip the crossfade for anyone who has asked for reduced motion.
    const still = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    if (!still) {
      root.classList.add('theme-transition');
      window.setTimeout(() => root.classList.remove('theme-transition'), TRANSITION_MS);
    }

    root.setAttribute('data-theme', next);
    setTheme(next);

    try {
      localStorage.setItem(THEME_KEY, next);
    } catch {
      // Private mode or a full quota. The theme still applies for this visit;
      // only remembering it across visits is lost.
    }
  }, []);

  const goingTo = theme === 'dark' ? 'light' : 'dark';

  return (
    <button
      type="button"
      onClick={toggle}
      aria-label={mounted ? `Switch to ${goingTo} theme` : 'Switch theme'}
      title={mounted ? `Switch to ${goingTo} theme` : 'Switch theme'}
      className={`grid h-9 w-9 shrink-0 place-items-center rounded-lg border border-rule text-dim transition-colors hover:text-text ${className}`}
    >
      {/* Before mount the icon is unknowable, so reserve its box rather than
          guessing and swapping it a frame later. */}
      {mounted ? (
        <Icon name={theme === 'dark' ? 'sun' : 'moon'} size={16} />
      ) : (
        <span className="h-4 w-4" />
      )}
    </button>
  );
}
