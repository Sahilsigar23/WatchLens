import { createHmac, timingSafeEqual } from 'node:crypto';

import { cookies } from 'next/headers';

import { query, queryOne } from './db';
import {
  burnVerificationTime,
  hashPassword,
  validatePassword,
  verifyPassword,
} from './password';

/**
 * Email + password authentication.
 *
 * Passwords are scrypt-hashed (see password.ts) and never stored or logged in
 * the clear. Sign-in failures are throttled per account, and every failure —
 * unknown address, wrong password — returns the same message after the same
 * amount of work, so the endpoint cannot be used to discover which addresses
 * have accounts.
 *
 * Not included, and deliberately: email verification and password reset. Both
 * need an outbound mail provider, which this app does not have. A forgotten
 * password currently means deleting the account from /privacy and starting
 * again. That is a real limitation, not an oversight.
 */

const COOKIE_NAME = 'watchlens_session';
const COOKIE_MAX_AGE_SECONDS = 60 * 60 * 24 * 90;

/** Failed sign-ins tolerated before the account is briefly locked. */
const MAX_FAILED_ATTEMPTS = 8;
const LOCK_MINUTES = 15;

/**
 * An error whose message is safe to show the user as-is. Anything else that
 * escapes these functions is a bug and must not be surfaced verbatim.
 */
export class AuthError extends Error {}

/**
 * The same message for an unknown address and a wrong password. Distinguishing
 * them would turn the sign-in form into an account-existence oracle.
 */
const INVALID_CREDENTIALS = 'Invalid email or password.';

function secret(): string {
  const value = process.env.SESSION_SECRET;
  if (!value) throw new Error('SESSION_SECRET is not set. Copy .env.example to .env.local.');
  return value;
}

function sign(userId: number): string {
  const mac = createHmac('sha256', secret()).update(String(userId)).digest('hex');
  return `${userId}.${mac}`;
}

/** Verifies the cookie's HMAC in constant time and returns the user id. */
function verify(token: string): number | null {
  const separator = token.lastIndexOf('.');
  if (separator <= 0) return null;

  const rawId = token.slice(0, separator);
  const provided = token.slice(separator + 1);
  const userId = Number(rawId);
  if (!Number.isInteger(userId) || userId <= 0) return null;

  const expected = createHmac('sha256', secret()).update(rawId).digest('hex');
  const a = Buffer.from(provided, 'hex');
  const b = Buffer.from(expected, 'hex');
  if (a.length !== b.length || !timingSafeEqual(a, b)) return null;

  return userId;
}

function normalizeEmail(email: string): string {
  const normalized = String(email ?? '').trim().toLowerCase();
  if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(normalized)) {
    throw new AuthError('Enter a valid email address.');
  }
  return normalized;
}

async function startSession(userId: number): Promise<number> {
  const store = await cookies();
  store.set(COOKIE_NAME, sign(userId), {
    httpOnly: true,
    sameSite: 'lax',
    secure: process.env.NODE_ENV === 'production',
    path: '/',
    maxAge: COOKIE_MAX_AGE_SECONDS,
  });
  return userId;
}

/** Creates an account and signs it in. Fails if the address is already taken. */
export async function signUp(email: string, password: string): Promise<number> {
  const normalized = normalizeEmail(email);

  const invalid = validatePassword(password);
  if (invalid) throw new AuthError(invalid);

  const passwordHash = await hashPassword(password);

  /**
   * One statement does both jobs, so two simultaneous sign-ups cannot race:
   *
   *  - New address: plain insert.
   *  - Address held by a pre-password account (NULL hash): the `WHERE` lets the
   *    update through and the account is *claimed* with this password, keeping
   *    its watch history. This is not a new weakness — before passwords, that
   *    address alone already granted full access to the account — and claiming
   *    is what ends that exposure. Only a NULL hash is claimable, so it can
   *    happen exactly once.
   *  - Address with a password already set: the `WHERE` blocks the update, no
   *    row comes back, and we refuse.
   */
  const row = await queryOne<{ id: string }>(
    `INSERT INTO users (email, password_hash) VALUES ($1, $2)
     ON CONFLICT (email) DO UPDATE
       SET password_hash = EXCLUDED.password_hash,
           failed_attempts = 0,
           locked_until = NULL
       WHERE users.password_hash IS NULL
     RETURNING id`,
    [normalized, passwordHash],
  );
  if (!row) {
    throw new AuthError('That email already has an account. Sign in instead.');
  }

  return startSession(Number(row.id));
}

/** Verifies credentials and starts a session. */
export async function signIn(email: string, password: string): Promise<number> {
  const normalized = normalizeEmail(email);

  const user = await queryOne<{
    id: string;
    password_hash: string | null;
    failed_attempts: number;
    locked_until: Date | null;
  }>(
    'SELECT id, password_hash, failed_attempts, locked_until FROM users WHERE email = $1',
    [normalized],
  );

  // No such account. Spend the same time hashing anyway so the response time
  // does not reveal that the address is unregistered.
  if (!user) {
    await burnVerificationTime(password);
    throw new AuthError(INVALID_CREDENTIALS);
  }

  if (user.locked_until && user.locked_until.getTime() > Date.now()) {
    const minutes = Math.ceil((user.locked_until.getTime() - Date.now()) / 60_000);
    throw new AuthError(`Too many failed attempts. Try again in ${minutes} minute(s).`);
  }

  // A row with no hash was created before passwords existed. Signing it in on
  // the strength of the address alone is the hole being closed here, so send
  // the owner to sign-up instead, which claims the account and keeps its
  // history rather than stranding it.
  if (!user.password_hash) {
    throw new AuthError(
      'This account was created before passwords. Use “Create one” with this same email to set a password — your history is kept.',
    );
  }

  if (!(await verifyPassword(password, user.password_hash))) {
    const attempts = Number(user.failed_attempts) + 1;
    const lock = attempts >= MAX_FAILED_ATTEMPTS;

    await query(
      `UPDATE users
          SET failed_attempts = $2,
              locked_until = CASE WHEN $3 THEN now() + ($4 || ' minutes')::interval ELSE locked_until END
        WHERE id = $1`,
      [Number(user.id), lock ? 0 : attempts, lock, String(LOCK_MINUTES)],
    );

    throw new AuthError(INVALID_CREDENTIALS);
  }

  await query(
    'UPDATE users SET failed_attempts = 0, locked_until = NULL WHERE id = $1',
    [Number(user.id)],
  );

  return startSession(Number(user.id));
}

export async function signOut(): Promise<void> {
  const store = await cookies();
  store.delete(COOKIE_NAME);
}

/** The signed-in user's id, or null. */
export async function getCurrentUserId(): Promise<number | null> {
  const store = await cookies();
  const token = store.get(COOKIE_NAME)?.value;
  return token ? verify(token) : null;
}

export async function getCurrentUser(): Promise<{ id: number; email: string } | null> {
  const userId = await getCurrentUserId();
  if (userId === null) return null;

  const row = await queryOne<{ id: string; email: string }>(
    'SELECT id, email FROM users WHERE id = $1',
    [userId],
  );
  return row ? { id: Number(row.id), email: row.email } : null;
}

/** For API routes: the user id, or a thrown 401-shaped error. */
export class UnauthorizedError extends Error {
  constructor() {
    super('Not signed in');
  }
}

export async function requireUserId(): Promise<number> {
  const userId = await getCurrentUserId();
  if (userId === null) throw new UnauthorizedError();
  return userId;
}
