import type { Category } from '@/lib/types';

const STYLES: Record<Category, { label: string; color: string }> = {
  STUDY: { label: 'Study', color: 'var(--color-study)' },
  ENTERTAINMENT: { label: 'Entertainment', color: 'var(--color-fun)' },
  OTHER: { label: 'Other', color: 'var(--color-other)' },
};

export function CategoryBadge({ category }: { category: Category }) {
  const style = STYLES[category] ?? STYLES.OTHER;
  return (
    <span
      className="inline-flex items-center gap-1.5 rounded-full border border-line px-2 py-0.5 text-xs font-medium"
      style={{ color: style.color }}
    >
      <span className="h-1.5 w-1.5 rounded-full" style={{ background: style.color }} />
      {style.label}
    </span>
  );
}
