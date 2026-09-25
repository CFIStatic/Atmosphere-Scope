import { cookies } from "next/headers";
import { NextResponse } from "next/server";
import { authMode, localSession, publicSession, serializeSessionCookie } from "@/auth/access";
import { devSignInAllowed } from "@/auth/gate";

const COOKIE = "scope_session";

export async function POST(request: Request) {
  if (!devSignInAllowed(authMode())) return NextResponse.json({ error: "Not found." }, { status: 404 });
  const body = (await request.json()) as { name?: string; email?: string; role?: string };
  try {
    const session = localSession(body);
    const jar = await cookies();
    jar.set(COOKIE, serializeSessionCookie(session), { httpOnly: true, sameSite: "lax", path: "/", maxAge: 60 * 60 * 12 });
    return NextResponse.json({ mode: authMode(), session: publicSession(session) });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Sign-in failed.";
    return NextResponse.json({ error: message }, { status: 400 });
  }
}
