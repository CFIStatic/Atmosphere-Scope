import { NextResponse } from "next/server";
import { authMode } from "@/auth/access";
import { isAccountRole } from "@/auth/gate";
import { callbackUrl, siteOrigin } from "@/auth/http";
import { getActor } from "@/auth/request-session";
import { createSupabaseAdmin } from "@/auth/supabase-server";
import { inviteEmail, resendConfigured, sendMail } from "@/email/resend";
import { addMember, listMembers, revokeMember } from "@/storage/workspace-book";

export async function GET() {
  const { actor } = await getActor();
  if (!actor) return NextResponse.json({ error: "Sign in required." }, { status: 401 });
  const members = await listMembers(actor.userId);
  return NextResponse.json({ members });
}

export async function POST(request: Request) {
  const { actor } = await getActor();
  if (!actor) return NextResponse.json({ error: "Sign in required." }, { status: 401 });
  const body = (await request.json()) as { email?: string; role?: string };
  if (!isAccountRole(body.role) || body.role === "admin") {
    return NextResponse.json({ error: "Invite an estimator or a customer." }, { status: 400 });
  }
  const email = body.email?.trim().toLowerCase() ?? "";
  try {
    let userId = email;
    let mailed = false;
    if (authMode() === "supabase") {
      const admin = createSupabaseAdmin();
      if (!admin) return NextResponse.json({ error: "The service role key is missing on the server." }, { status: 503 });
      const redirectTo = callbackUrl(siteOrigin(request), "/auth/reset");
      if (resendConfigured()) {
        const link = await admin.auth.admin.generateLink({ type: "invite", email, options: { redirectTo } });
        if (link.error || !link.data.user) return NextResponse.json({ error: "The invite was not sent." }, { status: 400 });
        userId = link.data.user.id;
        await admin.auth.admin.updateUserById(userId, { app_metadata: { ...link.data.user.app_metadata, role: body.role } });
        const action = link.data.properties?.action_link;
        if (action) mailed = (await sendMail(inviteEmail({ email, link: action }))).sent;
      } else {
        const invited = await admin.auth.admin.inviteUserByEmail(email, { redirectTo });
        if (invited.error || !invited.data.user) return NextResponse.json({ error: "The invite was not sent." }, { status: 400 });
        userId = invited.data.user.id;
        await admin.auth.admin.updateUserById(userId, { app_metadata: { ...invited.data.user.app_metadata, role: body.role } });
      }
    }
    const member = await addMember(actor.userId, { email, role: body.role, userId });
    return NextResponse.json({ member, mailed });
  } catch (error) {
    const message = error instanceof Error ? error.message : "The invite was not sent.";
    return NextResponse.json({ error: message }, { status: 400 });
  }
}

export async function DELETE(request: Request) {
  const { actor } = await getActor();
  if (!actor) return NextResponse.json({ error: "Sign in required." }, { status: 401 });
  const body = (await request.json()) as { email?: string };
  try {
    await revokeMember(actor.userId, body.email ?? "");
    return NextResponse.json({ ok: true });
  } catch (error) {
    const message = error instanceof Error ? error.message : "The member was not revoked.";
    return NextResponse.json({ error: message }, { status: 400 });
  }
}
