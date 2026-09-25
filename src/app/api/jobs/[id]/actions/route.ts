import { NextResponse } from "next/server";
import { applyJobAction, type JobAction } from "@/domain/actions";
import { getJob, saveJob } from "@/storage/job-store";

export async function POST(request: Request, context: { params: Promise<{ id: string }> }) {
  const { id } = await context.params;
  const job = await getJob(id);
  if (!job) return NextResponse.json({ error: "Job not found." }, { status: 404 });
  try {
    const action = (await request.json()) as JobAction;
    const next = await saveJob(applyJobAction(job, action));
    return NextResponse.json(next);
  } catch (error) {
    const message = error instanceof Error ? error.message : "Action failed.";
    return NextResponse.json({ error: message }, { status: 400 });
  }
}
