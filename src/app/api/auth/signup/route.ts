import { cookies } from "next/headers";
import { NextResponse } from "next/server";
import { authMode, localSession, publicSession } from "@/auth/access";
import { passwordProblem } from "@/auth/gate";
import { storeLocalPassword } from "@/auth/passwords";
import { clientKey, rateLimit } from "@/auth/rate-limit";
import { serializeSessionCookie } from "@/auth/signed-cookie";
import { getProfile, saveOrg, saveProfile } from "@/storage/workspace-book";

const COOKIE = "scope_session";

export async function POST(request: Request) {
  const limited = rateLimit(clientKey(request, "signup"));
  if (!limited.ok) return NextResponse.json({ error: "Too many attempts. Wait a few minutes and try again." }, { status: 429 });
  const body = (await request.json()) as { email?: string; password?: string; fullName?: string; companyName?: string; address?: string; licenseNumbers?: string };
  const email = body.email?.trim().toLowerCase() ?? "";
  const password = body.password ?? "";
  const fullName = body.fullName?.trim() ?? "";
  if (!email.includes("@")) return NextResponse.json({ error: "Enter an email." }, { status: 400 });
  const problem = passwordProblem(password);
  if (problem) return NextResponse.json({ error: problem }, { status: 400 });
  if (fullName.length < 2) return NextResponse.json({ error: "Enter your name." }, { status: 400 });
  if (authMode() === "supabase") {
    return NextResponse.json({ error: "Atmosphere Scope is invite-only. Use the link from your admin." }, { status: 403 });
  }
  const stored = await storeLocalPassword(email, password);
  if (stored) return NextResponse.json({ error: stored }, { status: 400 });
  await saveProfile(email, email, { fullName, onboardingComplete: false });
  if (body.companyName?.trim()) {
    await saveOrg(email, email, "estimator", {
      name: body.companyName,
      address: body.address ?? "",
      licenseNumbers: body.licenseNumbers ?? "",
    });
  } else {
    await getProfile(email, email);
  }
  const session = localSession({ name: fullName, email, role: "estimator" });
  const jar = await cookies();
  jar.set(COOKIE, serializeSessionCookie(session), { httpOnly: true, sameSite: "lax", path: "/", maxAge: 60 * 60 * 12 });
  return NextResponse.json({ mode: authMode(), session: publicSession(session), needsEmailConfirmation: false });
}
