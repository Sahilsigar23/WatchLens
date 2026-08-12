import { createHmac, timingSafeEqual } from 'node:crypto';

import { cookies } from 'next/headers';

import { queryOne } from './db';

/**
 * Minimal identity layer.
 *
 * IMPORTANT, and stated plainly in the README and on /privacy: this is *not*
 * authentication. There is no password and no email verification, so anyone who
 * types your email address sees your history. It exists so the MVP has a stable
 * user id, a working sign-out, and a real "delete my account" path.
 *
 * Before putting this on the public internet with more than one user, replace
 * `signIn` with a real provider (NextAuth / Clerk / Auth.js). Everything else in
 * the app only depends on `getCurrentUserId()`, so the swap is contained.
 */

const COOKIE_NAME = 'watchlens_session';
const COOKIE_MAX_AGE_SECONDS = 60 * 60 * 24 * 90;

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

/** Finds or creates the user for `email` and sets the session cookie. */
export async function signIn(email: string): Promise<number> {
  const normalized = email.trim().toLowerCase();
  if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(normalized)) {
    throw new Error('Enter a valid email address.');
  }

  const row = await queryOne<{ id: string }>(
    `INSERT INTO users (email) VALUES ($1)
     ON CONFLICT (email) DO UPDATE SET email = EXCLUDED.email
     RETURNING id`,
    [normalized],
  );
  if (!row) throw new Error('Could not create the user.');

  const userId = Number(row.id);
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
