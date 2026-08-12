import { NextResponse } from 'next/server';

import { AuthError, getCurrentUser, signIn, signOut, signUp } from '@/lib/auth';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/** GET /api/auth — who am I? */
export async function GET() {
  try {
    return NextResponse.json({ user: await getCurrentUser() });
  } catch {
    return NextResponse.json({ user: null });
  }
}

/**
 * POST /api/auth — `{ email, password, action: 'signin' | 'signup' }`
 *
 * `AuthError` messages are written to be shown to the user and are returned as
 * 400. Anything else is a bug: it is logged server-side and answered with a
 * generic 500, so an internal failure never leaks its details to the client.
 */
export async function POST(request: Request) {
  try {
    const body = (await request.json()) as {
      email?: string;
      password?: string;
      action?: string;
    };

    const email = String(body.email ?? '');
    const password = String(body.password ?? '');
    const userId =
      body.action === 'signup' ? await signUp(email, password) : await signIn(email, password);

    return NextResponse.json({ userId });
  } catch (error) {
    if (error instanceof AuthError) {
      return NextResponse.json({ error: error.message }, { status: 400 });
    }
    console.error('POST /api/auth failed:', error);
    return NextResponse.json({ error: 'Could not sign in.' }, { status: 500 });
  }
}

/** DELETE /api/auth — sign out. Data is kept; use /api/account to erase it. */
export async function DELETE() {
  await signOut();
  return NextResponse.json({ ok: true });
}
