import { NextResponse } from "next/server";
import { getActor } from "@/auth/request-session";
import { membershipFor, notificationPref, saveProfile, getProfile } from "@/storage/workspace-book";

export async function GET() {
  const { actor } = await getActor();
  if (!actor) return NextResponse.json({ error: "Sign in required." }, { status: 401 });
  const profile = await getProfile(actor.userId, actor.email);
  const membership = await membershipFor(actor.userId);
  const notifications = await notificationPref(actor.userId);
  return NextResponse.json({
    profile: { ...profile, fullName: profile.fullName || actor.name },
    org: membership?.org ?? null,
    defaults: membership?.defaults ?? null,
    notifications,
    role: actor.role,
  });
}

export async function PATCH(request: Request) {
  const { actor } = await getActor();
  if (!actor) return NextResponse.json({ error: "Sign in required." }, { status: 401 });
  const body = (await request.json()) as { fullName?: string };
  const fullName = body.fullName?.trim() ?? "";
  if (fullName.length < 2) return NextResponse.json({ error: "Enter your name." }, { status: 400 });
  const profile = await saveProfile(actor.userId, actor.email, { fullName });
  return NextResponse.json({ profile });
}
