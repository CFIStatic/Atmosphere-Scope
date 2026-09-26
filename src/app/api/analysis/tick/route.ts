import { NextResponse } from "next/server";
import { analysisJobStore } from "@/analysis/video/job-queue";
import { tickAnalysisQueue } from "@/analysis/video/worker";
import { getJob, readMediaFile, saveJob } from "@/storage/job-store";
import { assertJobWriter } from "@/storage/visible-jobs";

export async function POST() {
  const writer = await assertJobWriter();
  if ("error" in writer) return NextResponse.json({ error: writer.error }, { status: writer.status });
  const result = await tickAnalysisQueue({
    store: analysisJobStore(),
    loadJob: getJob,
    saveJob,
    readMedia: async (key) => readMediaFile(key),
  });
  return NextResponse.json(result);
}
