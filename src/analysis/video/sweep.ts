/**
 * Which queued readings still need a worker.
 * Adapted from Atmosphere `backend/src/shared/proofAnalysisSweep.ts` (commit a9e2680).
 */

export function needsNarration(status: string | null | undefined): boolean {
  if (!status || status === "idle") return true;
  return status === "skipped" || status === "failed" || status === "queued" || status === "running";
}

export function needsTranscript(status: string | null | undefined): boolean {
  return !status || status === "idle" || status === "failed" || status === "skipped" || status === "queued" || status === "running";
}

export function needsAnalysisReclaim(status: string | null | undefined): boolean {
  return !status || status === "idle" || status === "queued" || status === "running" || status === "failed";
}
