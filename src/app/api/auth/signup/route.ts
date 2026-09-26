import { cookies } from "next/headers";
import { NextResponse } from "next/server";
import { accountSession, authMode, publicSession } from "@/auth/access";
import { passwordProblem, RATE_LIMITED } from "@/auth/gate";
import { callbackUrl, rateLimitMessage, siteOrigin } from "@/auth/http";
import { storeLocalPassword } from "@/auth/passwords";
import { clientKey, rateLimit } from "@/auth/rate-limit";
import { serializeSessionCookie } from "@/auth/signed-cookie";
import { SIGNUP_EXISTS, signupOutcome, signupPlan } from "@/auth/signup";
import { createSupabaseAdmin, createSupabaseServer } from "@/auth/supabase-server";
import { claimMembership, findCredential, membershipByEmail, saveOrg, saveProfile } from "@/storage/workspace-book";

const COOKIE = "scope_session";

export async function POST(request: Request) {
  const limited = rateLimit(clientKey(request, "signup"));
  if (!limited.ok) return NextResponse.json({ error: RATE_LIMITED }, { status: 429 });
  const body = (await request.json()) as { email?: string; password?: string; fullName?: string; companyName?: string };
  const email = body.email?.trim().toLowerCase() ?? "";
  const password = body.password ?? "";
  const fullName = body.fullName?.trim() ?? "";
  if (!email.includes("@")) return NextResponse.json({ error: "Enter an email." }, { status: 400 });
  const problem = passwordProblem(password);
  if (problem) return NextResponse.json({ error: problem }, { status: 400 });
  if (fullName.length < 2) return NextResponse.json({ error: "Enter your name." }, { status: 400 });

  const membership = await membershipByEmail(email);
  const plan = signupPlan({
    companyName: body.companyName ?? "",
    membership: membership ? { orgId: membership.orgId, role: membership.role, revoked: Boolean(membership.revokedAt) } : null,
  });
  if (plan.kind === "error") return NextResponse.json({ error: plan.error }, { status: 400 });

  if (authMode() !== "supabase") {
    if (await findCredential(email)) return NextResponse.json({ error: SIGNUP_EXISTS }, { status: 400 });
    const stored = await storeLocalPassword(email, password);
    if (stored) return NextResponse.json({ error: stored }, { status: 400 });
    await saveProfile(email, email, { fullName, onboardingComplete: false });
    if (plan.kind === "create") {
      await saveOrg(email, email, "admin", { name: plan.companyName, address: "", licenseNumbers: "" }, { onboardingComplete: false });
    } else {
      await claimMembership(email, email, fullName);
    }
    const session = accountSession({ name: fullName, email, role: plan.role });
    const jar = await cookies();
    jar.set(COOKIE, serializeSessionCookie(session), { httpOnly: true, sameSite: "lax", path: "/", maxAge: 60 * 60 * 12 });
    return NextResponse.json({ mode: authMode(), session: publicSession(session), needsEmailConfirmation: false, joined: plan.kind === "join" });
  }

  const supabase = await createSupabaseServer();
  const admin = createSupabaseAdmin();
  if (!supabase || !admin) return NextResponse.json({ error: "Sign-up is not available." }, { status: 503 });
  const signed = await supabase.auth.signUp({
    email,
    password,
    options: {
      data: { name: fullName },
      emailRedirectTo: callbackUrl(siteOrigin(request), plan.kind === "join" ? "/record" : "/onboarding"),
    },
  });
  const outcome = signupOutcome({
    error: signed.error?.message ?? null,
    hasSession: Boolean(signed.data.session),
    identityCount: signed.data.user ? (signed.data.user.identities?.length ?? null) : null,
  });
  if (outcome === "exists") return NextResponse.json({ error: SIGNUP_EXISTS }, { status: 400 });
  if (outcome === "error" || !signed.data.user) {
    const message = rateLimitMessage(signed.error?.status ?? 400, signed.error?.message ?? "");
    if (message) return NextResponse.json({ error: message }, { status: 429 });
    return NextResponse.json({ error: signed.error?.message || "The account was not created." }, { status: 400 });
  }

  const userId = signed.data.user.id;
  try {
    const updated = await admin.auth.admin.updateUserById(userId, {
      app_metadata: { ...signed.data.user.app_metadata, role: plan.role },
      user_metadata: { ...signed.data.user.user_metadata, name: fullName },
    });
    if (updated.error) throw new Error(updated.error.message);
    await saveProfile(userId, email, { fullName, onboardingComplete: false });
    if (plan.kind === "create") {
      await saveOrg(userId, email, "admin", { name: plan.companyName, address: "", licenseNumbers: "" }, { onboardingComplete: false });
    } else {
      await claimMembership(email, userId, fullName);
    }
  } catch (error) {
    await admin.auth.admin.deleteUser(userId);
    const message = error instanceof Error ? error.message : "The account was not created.";
    return NextResponse.json({ error: message }, { status: 400 });
  }

  const needsEmailConfirmation = outcome === "confirm";
  const session = needsEmailConfirmation
    ? null
    : publicSession(accountSession({ name: fullName, email, role: plan.role }));
  return NextResponse.json({ mode: authMode(), session, needsEmailConfirmation, joined: plan.kind === "join" });
}
