import { NextResponse } from "next/server";
import { authMode } from "@/auth/access";
import { isAccountRole } from "@/auth/gate";
import { callbackUrl, siteOrigin } from "@/auth/http";
import { getRequestSession } from "@/auth/request-session";
import { createSupabaseAdmin } from "@/auth/supabase-server";

async function requireAdmin() {
  if (authMode() !== "supabase") return { error: "User administration needs STORAGE=supabase.", status: 404 } as const;
  const { session } = await getRequestSession();
  if (session?.role !== "admin") return { error: "An admin has to do that.", status: 403 } as const;
  const admin = createSupabaseAdmin();
  if (!admin) return { error: "The service role key is missing on the server.", status: 503 } as const;
  return { admin } as const;
}

export async function GET() {
  const gate = await requireAdmin();
  if ("error" in gate) return NextResponse.json({ error: gate.error }, { status: gate.status });
  const listed = await gate.admin.auth.admin.listUsers({ page: 1, perPage: 200 });
  if (listed.error) return NextResponse.json({ error: "The user list was not loaded." }, { status: 400 });
  const users = listed.data.users.map((user) => ({
    id: user.id,
    email: user.email ?? "",
    role: user.app_metadata?.role ?? null,
    banned: Boolean(user.banned_until && new Date(user.banned_until).getTime() > Date.now()),
  }));
  return NextResponse.json({ users });
}

export async function POST(request: Request) {
  const gate = await requireAdmin();
  if ("error" in gate) return NextResponse.json({ error: gate.error }, { status: gate.status });
  const body = (await request.json()) as { email?: string; role?: string; userId?: string; action?: string };
  const email = body.email?.trim().toLowerCase() ?? "";
  if (body.action === "deactivate" || body.action === "reactivate") {
    if (!body.userId) return NextResponse.json({ error: "Choose a user." }, { status: 400 });
    const updated = await gate.admin.auth.admin.updateUserById(body.userId, {
      ban_duration: body.action === "deactivate" ? "876000h" : "none",
    });
    if (updated.error) return NextResponse.json({ error: "The account was not updated." }, { status: 400 });
    return NextResponse.json({ ok: true });
  }
  if (body.action === "role") {
    if (!body.userId || !isAccountRole(body.role)) return NextResponse.json({ error: "Choose a role." }, { status: 400 });
    const existing = await gate.admin.auth.admin.getUserById(body.userId);
    if (existing.error || !existing.data.user) return NextResponse.json({ error: "That user was not found." }, { status: 404 });
    const updated = await gate.admin.auth.admin.updateUserById(body.userId, {
      app_metadata: { ...existing.data.user.app_metadata, role: body.role },
    });
    if (updated.error) return NextResponse.json({ error: "The role was not changed." }, { status: 400 });
    return NextResponse.json({ ok: true });
  }
  if (!email || (body.role !== "estimator" && body.role !== "customer")) {
    return NextResponse.json({ error: "Invite an email as an estimator or a customer." }, { status: 400 });
  }
  const invited = await gate.admin.auth.admin.inviteUserByEmail(email, {
    redirectTo: callbackUrl(siteOrigin(request), "/onboarding"),
  });
  if (invited.error || !invited.data.user) return NextResponse.json({ error: "The invite was not sent." }, { status: 400 });
  const roleSet = await gate.admin.auth.admin.updateUserById(invited.data.user.id, {
    app_metadata: { ...invited.data.user.app_metadata, role: body.role },
  });
  if (roleSet.error) return NextResponse.json({ error: "The invite was sent, but the role was not saved. Set app_metadata.role in the Supabase dashboard." }, { status: 500 });
  return NextResponse.json({ ok: true });
}
