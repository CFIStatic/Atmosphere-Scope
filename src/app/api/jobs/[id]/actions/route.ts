import { NextResponse } from "next/server";
import { actionAllowed } from "@/auth/access";
import { getRequestSession } from "@/auth/request-session";
import { applyJobAction, type JobAction } from "@/domain/actions";
import { saveJob } from "@/storage/job-store";
import { addJobEvent, membershipFor } from "@/storage/workspace-book";
import { assertJobWriter, loadVisibleJob } from "@/storage/visible-jobs";
import { getActor } from "@/auth/request-session";

function eventSummary(type: string): string {
  const labels: Record<string, string> = {
    process: "Walkthrough processed",
    retry: "Processing retried",
    sketch: "Sketch updated",
    undo: "Sketch undone",
    redo: "Sketch redone",
    edit_scope: "Scope line edited",
    apply_quantities: "Quantities applied",
    set_affected: "Affected area updated",
    add_named_room: "Room added",
    mark_reviewed: "Estimate marked reviewed",
    approve: "Estimate approved",
    authorize: "Estimate authorized",
  };
  return labels[type] ?? "Job file updated";
}

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
    const { actor } = await getActor();
    const membership = actor ? await membershipFor(actor.userId).catch(() => null) : null;
    await addJobEvent({
      jobId: id,
      orgId: membership?.org.id ?? null,
      actorEmail: actor?.email ?? "",
      summary: eventSummary(action.type),
    }).catch(() => undefined);
    return NextResponse.json(next);
  } catch (error) {
    const message = error instanceof Error ? error.message : "Action failed.";
    return NextResponse.json({ error: message }, { status: 400 });
  }
}
