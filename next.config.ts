import type { NextConfig } from 'next';

/**
 * WatchLens serves only the website and small JSON APIs.
 * Video bytes never touch this server — the YouTube IFrame embed loads
 * youtube.com directly in the user's browser.
 */
const nextConfig: NextConfig = {
  reactStrictMode: true,
};

export default nextConfig;
