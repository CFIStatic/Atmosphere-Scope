import { NextResponse } from "next/server";
import { createId, nowIso } from "@/domain/ids";
import { analysisJobStore, enqueueJob } from "@/analysis/video/job-queue";
import { assertJobWriter, loadVisibleJob } from "@/storage/visible-jobs";

export async function POST(request: Request) {
  const writer = await assertJobWriter();
  if ("error" in writer) return NextResponse.json({ error: writer.error }, { status: writer.status });
  const body = await request.json().catch(() => null) as { jobId?: string; mediaId?: string } | null;
  const jobId = String(body?.jobId ?? "");
  const mediaId = String(body?.mediaId ?? "");
  const loaded = await loadVisibleJob(jobId);
  if ("error" in loaded) return NextResponse.json({ error: loaded.error }, { status: loaded.status });
  const media = loaded.job.media.find((item) => item.id === mediaId && item.kind === "video");
  if (!media) return NextResponse.json({ error: "Video was not found on this job." }, { status: 404 });
  await enqueueJob(analysisJobStore(), {
    id: createId("anl"),
    jobId,
    mediaId,
    status: "pending",
    attempts: 0,
    maxAttempts: 3,
    leaseOwner: null,
    leaseUntil: null,
    lastError: null,
    stage: "queued",
    updatedAt: nowIso(),
  });
  return NextResponse.json({ queued: true });
}
