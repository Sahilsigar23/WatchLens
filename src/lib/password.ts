import { randomBytes, scrypt, timingSafeEqual, type ScryptOptions } from 'node:crypto';
import { promisify } from 'node:util';

/**
 * Password hashing.
 *
 * scrypt from Node's standard library, deliberately in preference to bcrypt or
 * argon2: both of those are native addons that have to compile for the build
 * platform, which is a recurring source of breakage on serverless deploys. Node
 * ships scrypt, it is memory-hard, and it is a recommended choice for password
 * storage — there is nothing to install and nothing to go wrong at build time.
 */

/**
 * `promisify` infers scrypt's three-argument overload and silently drops the
 * options parameter, so the cost factors below would be ignored. The explicit
 * signature keeps them.
 */
const scryptAsync = promisify(scrypt) as (
  password: string,
  salt: Buffer,
  keylen: number,
  options: ScryptOptions,
) => Promise<Buffer>;

/**
 * OWASP's recommended scrypt parameters. Memory cost is 128 * N * r bytes —
 * 16 MB here — which sits under Node's 32 MB default `maxmem`, so no caller has
 * to know to raise it. Roughly 100 ms per hash on a small serverless instance:
 * unnoticeable on a login, expensive in bulk.
 */
const N = 16_384;
const R = 8;
const P = 1;
const KEY_LENGTH = 64;
const SALT_LENGTH = 16;

/** `scrypt$N$r$p$salt$hash`, all base64. Self-describing so the cost factors
 *  can be raised later without invalidating existing hashes. */
const PREFIX = 'scrypt';

export const MIN_PASSWORD_LENGTH = 8;

/**
 * Upper bound so a huge body cannot be used to burn server time. scrypt's cost
 * does not grow with input length, but the surrounding JSON parsing does.
 */
export const MAX_PASSWORD_LENGTH = 200;

export function validatePassword(password: string): string | null {
  if (typeof password !== 'string' || password.length < MIN_PASSWORD_LENGTH) {
    return `Password must be at least ${MIN_PASSWORD_LENGTH} characters.`;
  }
  if (password.length > MAX_PASSWORD_LENGTH) {
    return `Password must be at most ${MAX_PASSWORD_LENGTH} characters.`;
  }
  return null;
}

export async function hashPassword(password: string): Promise<string> {
  const salt = randomBytes(SALT_LENGTH);
  const derived = await scryptAsync(password.normalize('NFKC'), salt, KEY_LENGTH, {
    N,
    r: R,
    p: P,
  });

  return [
    PREFIX,
    N,
    R,
    P,
    salt.toString('base64'),
    derived.toString('base64'),
  ].join('$');
}

/**
 * Verifies a password against a stored hash.
 *
 * Never throws: a malformed or truncated stored value is a failed verification,
 * not a 500 that would tell an attacker something about the row.
 */
export async function verifyPassword(password: string, stored: string): Promise<boolean> {
  try {
    const parts = stored.split('$');
    if (parts.length !== 6 || parts[0] !== PREFIX) return false;

    const [, n, r, p, saltB64, hashB64] = parts;
    const salt = Buffer.from(saltB64, 'base64');
    const expected = Buffer.from(hashB64, 'base64');
    if (salt.length === 0 || expected.length === 0) return false;

    const derived = await scryptAsync(password.normalize('NFKC'), salt, expected.length, {
      N: Number(n),
      r: Number(r),
      p: Number(p),
    });

    return derived.length === expected.length && timingSafeEqual(derived, expected);
  } catch {
    return false;
  }
}

/**
 * A real hash of a value nobody can supply, used to spend the same time on a
 * sign-in for an address that has no account as one that does.
 *
 * Without this, "unknown email" returns in microseconds while "wrong password"
 * takes ~100 ms, and that gap alone tells an attacker which addresses are
 * registered — which the deliberately vague error message is meant to hide.
 */
let dummyHash: string | null = null;

export async function burnVerificationTime(password: string): Promise<void> {
  dummyHash ??= await hashPassword(randomBytes(32).toString('hex'));
  await verifyPassword(password, dummyHash);
}
