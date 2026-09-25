import { NextResponse } from "next/server";
import { authMode } from "@/auth/access";
import { CONFIRM_SENT } from "@/auth/gate";
import { callbackUrl, rateLimitMessage, siteOrigin } from "@/auth/http";
import { createSupabaseServer } from "@/auth/supabase-server";

export async function POST(request: Request) {
  const body = (await request.json()) as { email?: string };
  const email = body.email?.trim() ?? "";
  if (!email || authMode() !== "supabase") return NextResponse.json({ message: CONFIRM_SENT });
  const supabase = await createSupabaseServer();
  if (!supabase) return NextResponse.json({ message: CONFIRM_SENT });
  const sent = await supabase.auth.resend({
    type: "signup",
    email,
    options: { emailRedirectTo: callbackUrl(siteOrigin(request), "/account") },
  });
  const limited = rateLimitMessage(sent.error?.status ?? 200, sent.error?.message ?? "");
  if (limited) return NextResponse.json({ error: limited }, { status: 429 });
  return NextResponse.json({ message: CONFIRM_SENT });
}
