import { NextResponse } from "next/server";
import { authMode } from "@/auth/access";
import { CONFIRM_SENT, RATE_LIMITED } from "@/auth/gate";
import { callbackUrl, rateLimitMessage, siteOrigin } from "@/auth/http";
import { clientKey, rateLimit } from "@/auth/rate-limit";
import { createSupabaseServer } from "@/auth/supabase-server";

export async function POST(request: Request) {
  const limited = rateLimit(clientKey(request, "resend"));
  if (!limited.ok) return NextResponse.json({ error: RATE_LIMITED }, { status: 429 });
  const body = (await request.json()) as { email?: string; next?: string };
  const email = body.email?.trim() ?? "";
  const next = body.next === "/record" ? "/record" : "/onboarding";
  if (!email || authMode() !== "supabase") return NextResponse.json({ message: CONFIRM_SENT });
  const supabase = await createSupabaseServer();
  if (!supabase) return NextResponse.json({ message: CONFIRM_SENT });
  const sent = await supabase.auth.resend({
    type: "signup",
    email,
    options: { emailRedirectTo: callbackUrl(siteOrigin(request), next) },
  });
  const message = rateLimitMessage(sent.error?.status ?? 200, sent.error?.message ?? "");
  if (message) return NextResponse.json({ error: message }, { status: 429 });
  return NextResponse.json({ message: CONFIRM_SENT });
}
