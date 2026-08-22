import type { NextConfig } from 'next';

/**
 * WatchLens serves only the website and small JSON APIs.
 * Video bytes never touch this server — the YouTube IFrame embed loads
 * youtube.com directly in the user's browser.
 */
const nextConfig: NextConfig = {
  reactStrictMode: true,

  /**
   * Hides the floating Next.js badge in the bottom-left corner of the dev
   * server. It is injected by the framework into a shadow DOM (`NEXTJS-PORTAL`
   * → `button#next-logo`), never renders in a production build, and is not
   * part of the WatchLens UI — but it sits on top of the interface while
   * developing and reviewing the design, so it is off.
   */
  devIndicators: false,
};

export default nextConfig;
