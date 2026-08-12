import { describe, expect, it } from 'vitest';

import {
  MAX_PASSWORD_LENGTH,
  MIN_PASSWORD_LENGTH,
  hashPassword,
  validatePassword,
  verifyPassword,
} from '@/lib/password';

/**
 * Password hashing. Pure crypto — no database, no browser.
 *
 * These are slower than the rest of the suite by design: scrypt is meant to
 * cost something. A hash that returned instantly would be the bug.
 */

describe('hashing', () => {
  it('round-trips a password', async () => {
    const hash = await hashPassword('correct horse battery staple');
    expect(await verifyPassword('correct horse battery staple', hash)).toBe(true);
  });

  it('rejects the wrong password', async () => {
    const hash = await hashPassword('correct horse battery staple');
    expect(await verifyPassword('Correct horse battery staple', hash)).toBe(false);
    expect(await verifyPassword('', hash)).toBe(false);
  });

  it('never stores the password in the hash', async () => {
    const secret = 'super-secret-passphrase';
    expect(await hashPassword(secret)).not.toContain(secret);
  });

  it('salts, so the same password hashes differently every time', async () => {
    const [a, b] = await Promise.all([hashPassword('same-password'), hashPassword('same-password')]);
    expect(a).not.toBe(b);
    // Both still verify — the difference is salt, not a broken derivation.
    expect(await verifyPassword('same-password', a)).toBe(true);
    expect(await verifyPassword('same-password', b)).toBe(true);
  });

  it('records its cost factors so they can be raised later', async () => {
    const [scheme, n, r, p] = (await hashPassword('whatever')).split('$');
    expect(scheme).toBe('scrypt');
    expect(Number(n)).toBeGreaterThanOrEqual(16384);
    expect(Number(r)).toBe(8);
    expect(Number(p)).toBe(1);
  });

  it('treats a malformed stored hash as a failure, not an exception', async () => {
    for (const stored of ['', 'garbage', 'scrypt$1$2$3', 'scrypt$16384$8$1$$', 'bcrypt$a$b$c$d$e']) {
      expect(await verifyPassword('anything', stored)).toBe(false);
    }
  });

  it('normalises unicode so an equivalent password still verifies', async () => {
    // "é" composed vs decomposed — identical to a user, different bytes.
    const hash = await hashPassword('café-password');
    expect(await verifyPassword('café-password', hash)).toBe(true);
  });
});

describe('password rules', () => {
  it('requires a minimum length', () => {
    expect(validatePassword('a'.repeat(MIN_PASSWORD_LENGTH - 1))).toMatch(/at least/);
    expect(validatePassword('a'.repeat(MIN_PASSWORD_LENGTH))).toBeNull();
  });

  it('caps the length', () => {
    expect(validatePassword('a'.repeat(MAX_PASSWORD_LENGTH))).toBeNull();
    expect(validatePassword('a'.repeat(MAX_PASSWORD_LENGTH + 1))).toMatch(/at most/);
  });

  it('rejects non-strings', () => {
    expect(validatePassword(undefined as unknown as string)).toMatch(/at least/);
  });
});
