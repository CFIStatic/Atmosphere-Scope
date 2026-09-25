import { cookies } from "next/headers";
import { NextResponse } from "next/server";
import { authMode, publicSession, sessionFromSupabaseUser } from "@/auth/access";
import { passwordProblem, roleFromAppMetadata, SIGN_IN_ERROR } from "@/auth/gate";
import { rateLimitMessage } from "@/auth/http";
import { getRequestSession } from "@/auth/request-session";
import { createSupabaseServer } from "@/auth/supabase-server";

const COOKIE = "scope_session";

export async function GET() {
  const { mode, session } = await getRequestSession();
  return NextResponse.json({ mode, session });
}

export async function POST(request: Request) {
  const body = (await request.json()) as { email?: string; password?: string };
  const email = body.email?.trim() ?? "";
  const password = body.password ?? "";
  if (authMode() !== "supabase") {
    return NextResponse.json({ error: "Password sign-in needs STORAGE=supabase. Use the dev-only sign-in on this server." }, { status: 400 });
  }
  if (!email || !password || passwordProblem(password)) {
    return NextResponse.json({ error: SIGN_IN_ERROR }, { status: 400 });
  }
  const supabase = await createSupabaseServer();
  if (!supabase) return NextResponse.json({ error: "Sign-in is not available." }, { status: 503 });
  const signed = await supabase.auth.signInWithPassword({ email, password });
  if (signed.error || !signed.data.user) {
    const limited = rateLimitMessage(signed.error?.status ?? 400, signed.error?.message ?? "");
    return NextResponse.json({ error: limited ?? SIGN_IN_ERROR }, { status: limited ? 429 : 400 });
  }
  if (!roleFromAppMetadata(signed.data.user.app_metadata)) {
    await supabase.auth.signOut();
    return NextResponse.json({ error: "This account has no role yet. Ask an admin." }, { status: 403 });
  }
  const session = publicSession(sessionFromSupabaseUser(signed.data.user, signed.data.session?.access_token || "cookie"));
  return NextResponse.json({ mode: authMode(), session });
}

export async function DELETE() {
  const supabase = authMode() === "supabase" ? await createSupabaseServer() : null;
  if (supabase) await supabase.auth.signOut();
  const jar = await cookies();
  jar.delete(COOKIE);
  return NextResponse.json({ mode: authMode(), session: null });
}
