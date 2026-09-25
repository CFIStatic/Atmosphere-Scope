import { NextResponse } from "next/server";
import type { EmailOtpType } from "@supabase/supabase-js";
import { safeNext } from "@/auth/gate";
import { createSupabaseServer } from "@/auth/supabase-server";

const OTP_TYPES = new Set<EmailOtpType>(["signup", "invite", "magiclink", "recovery", "email_change", "email"]);

export async function GET(request: Request) {
  const url = new URL(request.url);
  const next = safeNext(url.searchParams.get("next"));
  const code = url.searchParams.get("code");
  const tokenHash = url.searchParams.get("token_hash");
  const type = url.searchParams.get("type");
  const supabase = await createSupabaseServer();
  if (!supabase) return NextResponse.redirect(new URL("/auth/reset?error=invalid", url.origin));

  if (code) {
    const exchanged = await supabase.auth.exchangeCodeForSession(code);
    if (exchanged.error) return NextResponse.redirect(new URL("/auth/reset?error=invalid", url.origin));
  } else if (tokenHash && type && OTP_TYPES.has(type as EmailOtpType)) {
    const verified = await supabase.auth.verifyOtp({ type: type as EmailOtpType, token_hash: tokenHash });
    if (verified.error) return NextResponse.redirect(new URL("/auth/reset?error=invalid", url.origin));
  } else {
    return NextResponse.redirect(new URL("/auth/reset?error=invalid", url.origin));
  }
  return NextResponse.redirect(new URL(next, url.origin));
}
