import { NextResponse } from "next/server";
import { authMode } from "@/auth/access";
import { RESET_SENT } from "@/auth/gate";
import { clientKey, rateLimit } from "@/auth/rate-limit";
import { callbackUrl, rateLimitMessage, siteOrigin } from "@/auth/http";
import { createSupabaseAdmin, createSupabaseServer } from "@/auth/supabase-server";
import { resendConfigured, resetEmail, sendMail } from "@/email/resend";

export async function POST(request: Request) {
  const limited = rateLimit(clientKey(request, "forgot"));
  if (!limited.ok) return NextResponse.json({ error: "Too many attempts. Wait a few minutes and try again." }, { status: 429 });
  const body = (await request.json()) as { email?: string };
  const email = body.email?.trim() ?? "";
  if (!email) return NextResponse.json({ message: RESET_SENT });
  if (authMode() !== "supabase") return NextResponse.json({ message: RESET_SENT });
  if (resendConfigured()) {
    const admin = createSupabaseAdmin();
    const redirectTo = callbackUrl(siteOrigin(request), "/auth/reset");
    const link = admin ? await admin.auth.admin.generateLink({ type: "recovery", email, options: { redirectTo } }) : null;
    const action = link?.data.properties?.action_link;
    if (action) await sendMail(resetEmail({ email, link: action }));
    return NextResponse.json({ message: RESET_SENT });
  }
  const supabase = await createSupabaseServer();
  if (!supabase) return NextResponse.json({ message: RESET_SENT });
  const sent = await supabase.auth.resetPasswordForEmail(email, {
    redirectTo: callbackUrl(siteOrigin(request), "/auth/reset"),
  });
  const message = rateLimitMessage(sent.error?.status ?? 200, sent.error?.message ?? "");
  if (message) return NextResponse.json({ error: message }, { status: 429 });
  return NextResponse.json({ message: RESET_SENT });
}
