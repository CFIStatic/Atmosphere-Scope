import { cookies } from "next/headers";
import { NextResponse } from "next/server";
import { authMode, localSession, parseSessionCookie, publicSession, signInWithSupabase, type StoredSession } from "@/auth/access";

const COOKIE = "scope_session";

export async function GET() {
  const jar = await cookies();
  const session = parseSessionCookie(jar.get(COOKIE)?.value);
  return NextResponse.json({ mode: authMode(), session: session ? publicSession(session) : null });
}

export async function POST(request: Request) {
  const body = (await request.json()) as { name?: string; email?: string; role?: string; password?: string };
  try {
    const session: StoredSession = authMode() === "supabase"
      ? await signInWithSupabase({ email: body.email ?? "", password: body.password ?? "" }, process.env, fetch)
      : localSession(body);
    const jar = await cookies();
    jar.set(COOKIE, JSON.stringify(session), { httpOnly: true, sameSite: "lax", path: "/", maxAge: 60 * 60 * 12 });
    return NextResponse.json({ mode: authMode(), session: publicSession(session) });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Sign-in failed.";
    return NextResponse.json({ error: message }, { status: 400 });
  }
}

export async function DELETE() {
  const jar = await cookies();
  jar.delete(COOKIE);
  return NextResponse.json({ mode: authMode(), session: null });
}
