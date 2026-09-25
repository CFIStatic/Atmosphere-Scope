import { NextResponse } from "next/server";
import { actionAllowed } from "@/auth/access";
import { getRequestSession } from "@/auth/request-session";
import { applyJobAction, type JobAction } from "@/domain/actions";
import { saveJob } from "@/storage/job-store";
import { assertJobWriter, loadVisibleJob } from "@/storage/visible-jobs";

export async function POST(request: Request, context: { params: Promise<{ id: string }> }) {
  const { id } = await context.params;
  const loaded = await loadVisibleJob(id);
  if ("error" in loaded) return NextResponse.json({ error: loaded.error }, { status: loaded.status });
  const writer = await assertJobWriter();
  if ("error" in writer) return NextResponse.json({ error: writer.error }, { status: writer.status });
  try {
    const action = (await request.json()) as JobAction;
    const { session } = await getRequestSession();
    const denied = actionAllowed(action.type, session?.role ?? null);
    if (denied) return NextResponse.json({ error: denied }, { status: 401 });
    const next = await saveJob(applyJobAction(loaded.job, action));
    return NextResponse.json(next);
  } catch (error) {
    const message = error instanceof Error ? error.message : "Action failed.";
    return NextResponse.json({ error: message }, { status: 400 });
  }
}
