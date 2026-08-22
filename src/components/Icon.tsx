import type { SVGProps } from 'react';

/**
 * The app's icon set, inlined.
 *
 * A dependency-free set of hand-written paths rather than an icon package:
 * a dozen icons is a few hundred bytes here, and nothing extra reaches the
 * client bundle or the critical path in front of the player.
 *
 * All are stroked on a 24-grid so they share one visual weight, and they
 * inherit `currentColor` so a parent's text colour drives them.
 */

export type IconName =
  | 'lens'
  | 'search'
  | 'play'
  | 'clock'
  | 'calendar'
  | 'list'
  | 'history'
  | 'settings'
  | 'check'
  | 'flame'
  | 'chevronLeft'
  | 'chevronRight'
  | 'arrowUpRight'
  | 'sparkle'
  | 'trash'
  | 'close'
  | 'menu'
  | 'user'
  | 'sun'
  | 'moon';

const PATHS: Record<IconName, React.ReactNode> = {
  // The identity mark: a lens — an eye whose pupil is a play triangle.
  lens: (
    <>
      <path d="M2 12s3.6-7 10-7 10 7 10 7-3.6 7-10 7-10-7-10-7Z" />
      <circle cx="12" cy="12" r="3.6" />
    </>
  ),
  search: (
    <>
      <circle cx="11" cy="11" r="7" />
      <path d="m20 20-3.2-3.2" />
    </>
  ),
  play: <path d="M7 4.5v15l12-7.5-12-7.5Z" />,
  clock: (
    <>
      <circle cx="12" cy="12" r="9" />
      <path d="M12 7v5l3.5 2" />
    </>
  ),
  calendar: (
    <>
      <rect x="3" y="5" width="18" height="16" rx="2.5" />
      <path d="M8 3v4M16 3v4M3 10h18" />
    </>
  ),
  list: <path d="M8 6h13M8 12h13M8 18h13M3.5 6h.01M3.5 12h.01M3.5 18h.01" />,
  history: (
    <>
      <path d="M3 12a9 9 0 1 0 3-6.7L3 8" />
      <path d="M3 3v5h5" />
      <path d="M12 8v4.5l3 1.8" />
    </>
  ),
  settings: (
    <>
      <circle cx="12" cy="12" r="3" />
      <path d="M19.4 15a1.7 1.7 0 0 0 .3 1.9l.1.1a2 2 0 1 1-2.8 2.8l-.1-.1a1.7 1.7 0 0 0-2.9 1.2 2 2 0 1 1-4 0 1.7 1.7 0 0 0-2.9-1.2l-.1.1a2 2 0 1 1-2.8-2.8l.1-.1A1.7 1.7 0 0 0 4.6 15a2 2 0 1 1 0-4 1.7 1.7 0 0 0 1.2-2.9l-.1-.1a2 2 0 1 1 2.8-2.8l.1.1A1.7 1.7 0 0 0 11.5 4a2 2 0 1 1 4 0 1.7 1.7 0 0 0 2.9 1.2l.1-.1a2 2 0 1 1 2.8 2.8l-.1.1a1.7 1.7 0 0 0 1.2 2.9 2 2 0 1 1 0 4 1.7 1.7 0 0 0-1.9 1.1Z" />
    </>
  ),
  check: <path d="m4.5 12.5 5 5 10-11" />,
  flame: (
    <path d="M12 3s5 4 5 8.5a5 5 0 0 1-10 0c0-1.6.8-3 1.7-4 .2 1 .8 1.8 1.6 2.1.5-2.6-.4-5.1 1.7-6.6Z" />
  ),
  chevronLeft: <path d="m14.5 5-7 7 7 7" />,
  chevronRight: <path d="m9.5 5 7 7-7 7" />,
  arrowUpRight: <path d="M7 17 17 7M9 7h8v8" />,
  sparkle: <path d="M12 3.5 13.7 9l5.5 1.7-5.5 1.7L12 18l-1.7-5.6L4.8 10.7 10.3 9 12 3.5Z" />,
  trash: (
    <>
      <path d="M4 7h16M9.5 7V5.5A1.5 1.5 0 0 1 11 4h2a1.5 1.5 0 0 1 1.5 1.5V7" />
      <path d="M6.5 7l.8 12a2 2 0 0 0 2 1.9h5.4a2 2 0 0 0 2-1.9l.8-12" />
    </>
  ),
  close: <path d="m6 6 12 12M18 6 6 18" />,
  menu: <path d="M4 7h16M4 12h16M4 17h16" />,
  user: (
    <>
      <circle cx="12" cy="8.5" r="3.75" />
      <path d="M4.5 20a7.5 7.5 0 0 1 15 0" />
    </>
  ),
  sun: (
    <>
      <circle cx="12" cy="12" r="4" />
      <path d="M12 2.5v2.2M12 19.3v2.2M4.2 4.2l1.6 1.6M18.2 18.2l1.6 1.6M2.5 12h2.2M19.3 12h2.2M4.2 19.8l1.6-1.6M18.2 5.8l1.6-1.6" />
    </>
  ),
  moon: <path d="M20 14.5A8.5 8.5 0 0 1 9.5 4a8.5 8.5 0 1 0 10.5 10.5Z" />,
};

interface IconProps extends Omit<SVGProps<SVGSVGElement>, 'name'> {
  name: IconName;
  /** Pixel size for both dimensions. Default 18. */
  size?: number;
}

export function Icon({ name, size = 18, ...rest }: IconProps) {
  const filled = name === 'play' || name === 'flame' || name === 'sparkle';

  return (
    <svg
      viewBox="0 0 24 24"
      width={size}
      height={size}
      fill={filled ? 'currentColor' : 'none'}
      stroke={filled ? 'none' : 'currentColor'}
      strokeWidth={1.7}
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
      focusable="false"
      {...rest}
    >
      {PATHS[name]}
    </svg>
  );
}

/**
 * The WatchLens mark: the lens drawn in sodium on the panel ground, inside a
 * hairline tile.
 *
 * Flat rather than a gradient chip on purpose — sodium means "watched" all
 * through this interface, and the mark is the one place it is allowed to mean
 * the product itself.
 */
export function Logo({ size = 28 }: { size?: number }) {
  return (
    <span
      className="grid shrink-0 place-items-center rounded-lg border border-rule bg-panel text-signal"
      style={{ width: size, height: size }}
    >
      <Icon name="lens" size={Math.round(size * 0.62)} strokeWidth={1.8} />
    </span>
  );
}
