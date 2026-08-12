import { Icon, type IconName } from '@/components/Icon';

type Accent = 'brand' | 'study' | 'fun' | 'skip' | 'none';

const ACCENT_COLOR: Record<Accent, string | undefined> = {
  brand: undefined, // uses the gradient instead of a flat colour
  study: 'var(--color-study)',
  fun: 'var(--color-fun)',
  skip: 'var(--color-muted)',
  none: undefined,
};

/**
 * One headline number.
 *
 * `value === null` renders the skeleton, so a tile occupies its final size from
 * the first paint and the grid never jumps when the numbers arrive.
 */
export function StatTile({
  label,
  value,
  hint,
  icon,
  accent = 'none',
}: {
  label: string;
  value: string | null;
  hint?: string;
  icon?: IconName;
  accent?: Accent;
}) {
  const color = ACCENT_COLOR[accent];

  return (
    <div className="card card-hover p-4">
      <div className="flex items-center justify-between gap-2">
        <p className="text-xs font-medium uppercase tracking-wide text-muted">{label}</p>
        {icon && (
          <span className="text-muted" style={color ? { color } : undefined}>
            <Icon name={icon} size={15} />
          </span>
        )}
      </div>

      {value === null ? (
        <div className="skeleton mt-2 h-8 w-24" />
      ) : (
        <p
          className={`stat mt-1.5 text-2xl font-semibold sm:text-[1.75rem] ${
            accent === 'brand' ? 'gradient-text' : ''
          }`}
          style={color ? { color } : undefined}
        >
          {value}
        </p>
      )}

      {hint && <p className="mt-0.5 text-xs text-muted">{hint}</p>}
    </div>
  );
}
