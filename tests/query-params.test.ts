import { describe, expect, it } from 'vitest';

import { parsePositiveInt } from '@/lib/dates';

/**
 * Regression tests for a bug that silently capped the history page at one row.
 *
 * `searchParams.get()` returns null for a missing parameter, `Number(null)` is
 * 0, and 0 is finite — so `Number.isFinite(raw) ? clamp(raw) : fallback` took
 * the *first* branch for an absent parameter and clamped it to the minimum.
 */
describe('parsePositiveInt', () => {
  it('uses the fallback when the parameter is absent', () => {
    expect(parsePositiveInt(null, 100, 500)).toBe(100);
    expect(parsePositiveInt('', 100, 500)).toBe(100);
    expect(parsePositiveInt('   ', 100, 500)).toBe(100);
  });

  it('uses the fallback for values that are not usable counts', () => {
    expect(parsePositiveInt('0', 100, 500)).toBe(100);
    expect(parsePositiveInt('-5', 100, 500)).toBe(100);
    expect(parsePositiveInt('abc', 100, 500)).toBe(100);
    expect(parsePositiveInt('NaN', 100, 500)).toBe(100);
  });

  it('accepts a real value and caps it', () => {
    expect(parsePositiveInt('25', 100, 500)).toBe(25);
    expect(parsePositiveInt('25.9', 100, 500)).toBe(25);
    expect(parsePositiveInt('9999', 100, 500)).toBe(500);
    expect(parsePositiveInt('1', 100, 500)).toBe(1);
  });
});
