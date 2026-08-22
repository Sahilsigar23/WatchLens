/**
 * A duration set as a headline measurement.
 *
 * `formatDuration` returns things like "1h 7m" or "45m". Rendering that as one
 * run of text gives the unit letters the same weight as the digits, which is
 * wrong — the digits are the measurement and the units are a label. This splits
 * them so the number carries the size and the units recede, the way a figure is
 * set on an instrument.
 */
export function Figure({
  value,
  size = 'lg',
  tone = 'default',
}: {
  /** Output of `formatDuration`, or any digit/unit string like "62%". */
  value: string;
  size?: 'lg' | 'md' | 'sm';
  tone?: 'default' | 'signal' | 'dim';
}) {
  const parts = value.match(/(\d+(?:\.\d+)?)|([^\d\s]+)|(\s+)/g) ?? [value];

  // The hero figure keeps growing past `sm`: its column is ~1000px wide on a
  // 1440px display, and a 3.5rem number floating in that much space reads as an
  // afterthought rather than the headline measurement.
  const sizeClass =
    size === 'lg'
      ? 'text-[2.75rem] sm:text-[3.5rem] lg:text-[4.5rem]'
      : size === 'md'
        ? 'text-3xl sm:text-4xl'
        : 'text-xl sm:text-2xl';

  const unitClass =
    size === 'lg'
      ? 'text-[1.375rem] sm:text-[1.75rem] lg:text-[2.25rem]'
      : size === 'md'
        ? 'text-lg sm:text-xl'
        : 'text-sm sm:text-base';

  const toneClass =
    tone === 'signal' ? 'text-signal' : tone === 'dim' ? 'text-dim' : 'text-text';

  return (
    <span className={`display inline-flex items-baseline ${sizeClass} ${toneClass}`}>
      {parts.map((part, index) =>
        /^\d/.test(part) ? (
          <span key={index} className="tabular-nums">
            {part}
          </span>
        ) : (
          <span key={index} className={`${unitClass} opacity-55`}>
            {part === ' ' ? ' ' : part}
          </span>
        ),
      )}
    </span>
  );
}
