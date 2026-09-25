import { NextResponse } from "next/server";
import { getRequestSession } from "@/auth/request-session";
import { addJobShare } from "@/storage/shares";
import { assertJobWriter, loadVisibleJob } from "@/storage/visible-jobs";

export async function POST(request: Request, context: { params: Promise<{ id: string }> }) {
  const { id } = await context.params;
  const loaded = await loadVisibleJob(id);
  if ("error" in loaded) return NextResponse.json({ error: loaded.error }, { status: loaded.status });
  const writer = await assertJobWriter();
  if ("error" in writer) return NextResponse.json({ error: writer.error }, { status: writer.status });
  const { session } = await getRequestSession();
  if (session && session.role === "customer") return NextResponse.json({ error: "This account cannot share a job." }, { status: 403 });
  const body = (await request.json()) as { email?: string };
  try {
    const share = await addJobShare(id, body.email ?? "");
    return NextResponse.json({ share });
  } catch (error) {
    const message = error instanceof Error ? error.message : "The job was not shared.";
    return NextResponse.json({ error: message }, { status: 400 });
  }
}
