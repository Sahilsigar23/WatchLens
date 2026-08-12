import { NextResponse } from 'next/server';

import { getCurrentUser, signIn, signOut } from '@/lib/auth';

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

/** POST /api/auth — sign in with an email address. See the caveat in lib/auth.ts. */
export async function POST(request: Request) {
  try {
    const body = (await request.json()) as { email?: string };
    const userId = await signIn(String(body.email ?? ''));
    return NextResponse.json({ userId });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Could not sign in';
    const isValidation = message.startsWith('Enter a valid');
    if (!isValidation) console.error('POST /api/auth failed:', error);
    return NextResponse.json({ error: message }, { status: isValidation ? 400 : 500 });
  }
}

/** DELETE /api/auth — sign out. Data is kept; use /api/account to erase it. */
export async function DELETE() {
  await signOut();
  return NextResponse.json({ ok: true });
}
