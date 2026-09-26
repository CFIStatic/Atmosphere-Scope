import { NextResponse } from "next/server";
import { createId, nowIso } from "@/domain/ids";
import { analysisJobStore, enqueueJob } from "@/analysis/video/job-queue";
import { kickAnalysisWorker } from "@/analysis/video/supervisor";
import { ANALYSIS_STATUS_LABEL, analysisEventSummary, publicAnalysisStatus } from "@/analysis/video/status";
import { callerAttribution } from "@/analysis/usage-log";
import { addJobEvent } from "@/storage/workspace-book";
import { assertJobWriter, loadVisibleJob } from "@/storage/visible-jobs";

export async function GET(request: Request) {
  const jobId = new URL(request.url).searchParams.get("jobId") ?? "";
  const loaded = await loadVisibleJob(jobId);
  if ("error" in loaded) return NextResponse.json({ error: loaded.error }, { status: loaded.status });
  const rows = (await analysisJobStore().list()).filter((row) => row.jobId === jobId);
  const latest = rows.sort((a, b) => b.updatedAt.localeCompare(a.updatedAt))[0] ?? null;
  if (!latest) return NextResponse.json({ status: null });
  const status = publicAnalysisStatus(latest);
  return NextResponse.json({
    status,
    label: ANALYSIS_STATUS_LABEL[status],
    error: latest.status === "failed" ? latest.lastError : null,
    mediaId: latest.mediaId,
    updatedAt: latest.updatedAt,
  });
}

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
  const who = await callerAttribution();
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
    orgId: who.orgId,
    actorEmail: who.userEmail || null,
    updatedAt: nowIso(),
  });
  await addJobEvent({ jobId, orgId: who.orgId, actorEmail: who.userEmail, summary: analysisEventSummary("queued") }).catch(() => undefined);
  kickAnalysisWorker();
  return NextResponse.json({ queued: true });
}
