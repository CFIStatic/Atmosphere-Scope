import { NextResponse } from "next/server";
import { getActor } from "@/auth/request-session";
import { saveProfile } from "@/storage/workspace-book";

const MAX = 180_000;

export async function POST(request: Request) {
  const { actor } = await getActor();
  if (!actor) return NextResponse.json({ error: "Sign in required." }, { status: 401 });
  const body = (await request.json()) as { dataUrl?: string };
  const dataUrl = body.dataUrl ?? "";
  if (!dataUrl.startsWith("data:image/") || dataUrl.length > MAX) {
    return NextResponse.json({ error: "Use an image under 120 KB." }, { status: 400 });
  }
  const profile = await saveProfile(actor.userId, actor.email, { avatarUrl: dataUrl });
  return NextResponse.json({ profile });
}
