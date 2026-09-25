import { cookies } from "next/headers";
import { NextResponse } from "next/server";
import { parseSessionCookie } from "@/auth/access";
import type { WalkthroughSnapshot } from "@/capture/snapshot";
import { storeWalkthrough } from "@/storage/walkthrough-store";

const COOKIE = "scope_session";

export async function POST(request: Request) {
  const session = parseSessionCookie((await cookies()).get(COOKIE)?.value);
  if (!session) return NextResponse.json({ error: "Sign in before saving this walkthrough." }, { status: 401 });
  const body = (await request.json()) as { id?: string; snapshot?: WalkthroughSnapshot; videoKey?: string | null };
  if (!body.snapshot?.plan?.rooms || !Array.isArray(body.snapshot.plan.quantities)) {
    return NextResponse.json({ error: "The walkthrough needs a plan. Nothing was saved." }, { status: 400 });
  }
  const id = body.id?.trim() || body.snapshot.recordId?.trim() || crypto.randomUUID();
  try {
    const record = await storeWalkthrough(id, { ...body.snapshot, recordId: id, videoKey: body.videoKey ?? body.snapshot.videoKey ?? null }, body.videoKey ?? body.snapshot.videoKey ?? null);
    return NextResponse.json({ record });
  } catch (error) {
    const message = error instanceof Error ? error.message : "The walkthrough was not saved.";
    return NextResponse.json({ error: message }, { status: 409 });
  }
}
