import { NextResponse } from "next/server";
import { getActor } from "@/auth/request-session";
import { saveNotificationPref } from "@/storage/workspace-book";

export async function PUT(request: Request) {
  const { actor } = await getActor();
  if (!actor) return NextResponse.json({ error: "Sign in required." }, { status: 401 });
  const body = (await request.json()) as { jobShared?: boolean; invites?: boolean };
  const notifications = await saveNotificationPref(actor.userId, {
    userId: actor.userId,
    jobShared: Boolean(body.jobShared),
    invites: Boolean(body.invites),
  });
  return NextResponse.json({ notifications });
}
