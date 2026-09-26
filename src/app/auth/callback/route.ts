import { NextResponse } from "next/server";
import type { EmailOtpType } from "@supabase/supabase-js";
import { absoluteUrl, authCallbackDestination, siteOrigin } from "@/auth/http";
import { createSupabaseServer } from "@/auth/supabase-server";

const OTP_TYPES = new Set<EmailOtpType>(["signup", "invite", "magiclink", "recovery", "email_change", "email"]);

function redirectTo(request: Request, path: string) {
  return NextResponse.redirect(absoluteUrl(siteOrigin(request), path));
}

export async function GET(request: Request) {
  const url = new URL(request.url);
  const next = url.searchParams.get("next");
  const code = url.searchParams.get("code");
  const tokenHash = url.searchParams.get("token_hash");
  const type = url.searchParams.get("type");
  const supabase = await createSupabaseServer();
  if (!supabase) return redirectTo(request, authCallbackDestination({ ok: false, type, next }));

  if (code) {
    const exchanged = await supabase.auth.exchangeCodeForSession(code);
    if (exchanged.error) return redirectTo(request, authCallbackDestination({ ok: false, type, next }));
  } else if (tokenHash && type && OTP_TYPES.has(type as EmailOtpType)) {
    const verified = await supabase.auth.verifyOtp({ type: type as EmailOtpType, token_hash: tokenHash });
    if (verified.error) return redirectTo(request, authCallbackDestination({ ok: false, type, next }));
  } else {
    return redirectTo(request, authCallbackDestination({ ok: false, type, next }));
  }
  return redirectTo(request, authCallbackDestination({ ok: true, type, next }));
}
