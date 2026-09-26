import { NextResponse } from "next/server";
import { authMode } from "@/auth/access";
import { passwordProblem, SIGN_IN_ERROR } from "@/auth/gate";
import { localPasswordMatches, storeLocalPassword } from "@/auth/passwords";
import { clientKey, rateLimit } from "@/auth/rate-limit";
import { revokeUserSessions } from "@/auth/sessions";
import { rateLimitMessage } from "@/auth/http";
import { getActor, getRequestSession } from "@/auth/request-session";
import { createSupabaseServer } from "@/auth/supabase-server";

export async function POST(request: Request) {
  const limited = rateLimit(clientKey(request, "password"));
  if (!limited.ok) return NextResponse.json({ error: "Too many attempts. Wait a few minutes and try again." }, { status: 429 });
  const body = (await request.json()) as { currentPassword?: string; password?: string };
  const next = body.password ?? "";
  const problem = passwordProblem(next);
  if (problem) return NextResponse.json({ error: problem }, { status: 400 });
  if (authMode() !== "supabase") {
    const { actor } = await getActor();
    if (!actor) return NextResponse.json({ error: "Sign in required." }, { status: 401 });
    const current = body.currentPassword ?? "";
    if (!current || !(await localPasswordMatches(actor.email, current))) {
      return NextResponse.json({ error: SIGN_IN_ERROR }, { status: 400 });
    }
    const stored = await storeLocalPassword(actor.email, next);
    if (stored) return NextResponse.json({ error: stored }, { status: 400 });
    return NextResponse.json({ ok: true });
  }
  const { session } = await getRequestSession();
  if (!session) return NextResponse.json({ error: "This link is expired or invalid. Request another reset email." }, { status: 401 });
  const supabase = await createSupabaseServer();
  if (!supabase) return NextResponse.json({ error: "Sign-in is not available." }, { status: 503 });
  const { data: sessionData } = await supabase.auth.getSession();
  const factors = sessionData.session as { amr?: { method?: string }[] } | null;
  const recovery = factors?.amr?.some((item) => item.method === "recovery" || item.method === "invite") ?? false;
  const current = body.currentPassword ?? "";
  if (!recovery) {
    if (!current) return NextResponse.json({ error: "Enter your current password." }, { status: 400 });
    const check = await supabase.auth.signInWithPassword({ email: session.email, password: current });
    if (check.error) {
      const limited = rateLimitMessage(check.error.status ?? 400, check.error.message);
      return NextResponse.json({ error: limited ?? SIGN_IN_ERROR }, { status: limited ? 429 : 400 });
    }
  }
  const updated = await supabase.auth.updateUser({ password: next });
  if (updated.error) {
    const limited = rateLimitMessage(updated.error.status ?? 400, updated.error.message);
    return NextResponse.json({ error: limited ?? "The password was not changed." }, { status: limited ? 429 : 400 });
  }
  const { actor } = await getActor();
  if (actor) await revokeUserSessions(actor.userId);
  return NextResponse.json({ ok: true });
}
