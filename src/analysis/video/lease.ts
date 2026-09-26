/**
 * Exclusive claim on an analysis job, with retry after a lost worker.
 * Adapted from Atmosphere migrations `20260905190000_video_processing_job_lease.sql`
 * and `20260905191000_job_proofs_analysis_lease.sql` (commit a9e2680).
 * Scope stores the queue on `analysis_jobs` instead of verification_videos / job_proofs.
 */

export type AnalysisJobStatus = "pending" | "running" | "complete" | "failed";

export type AnalysisJobRow = {
  id: string;
  jobId: string;
  mediaId: string | null;
  status: AnalysisJobStatus;
  attempts: number;
  maxAttempts: number;
  leaseOwner: string | null;
  leaseUntil: string | null;
  lastError: string | null;
  stage: string | null;
  orgId: string | null;
  actorEmail: string | null;
  updatedAt: string;
};

export function leaseIsFree(row: AnalysisJobRow, nowMs: number): boolean {
  if (row.status === "complete" || row.status === "failed") return false;
  if (!row.leaseUntil) return true;
  const until = Date.parse(row.leaseUntil);
  return !Number.isFinite(until) || until <= nowMs;
}

export function claimNext(rows: AnalysisJobRow[], nowMs: number, owner: string, leaseMs: number): { claimed: AnalysisJobRow; rows: AnalysisJobRow[] } | null {
  const index = rows.findIndex((row) => (row.status === "pending" || row.status === "running") && leaseIsFree(row, nowMs) && row.attempts < row.maxAttempts);
  if (index < 0) return null;
  const current = rows[index]!;
  const claimed: AnalysisJobRow = {
    ...current,
    status: "running",
    leaseOwner: owner,
    leaseUntil: new Date(nowMs + leaseMs).toISOString(),
    stage: current.stage ?? "claim",
    updatedAt: new Date(nowMs).toISOString(),
  };
  const next = rows.slice();
  next[index] = claimed;
  return { claimed, rows: next };
}

export function completeJob(rows: AnalysisJobRow[], id: string, nowMs: number): AnalysisJobRow[] {
  return rows.map((row) => row.id === id ? { ...row, status: "complete", leaseOwner: null, leaseUntil: null, lastError: null, stage: "complete", updatedAt: new Date(nowMs).toISOString() } : row);
}

export function failJob(rows: AnalysisJobRow[], id: string, nowMs: number, error: string): AnalysisJobRow[] {
  return rows.map((row) => {
    if (row.id !== id) return row;
    const attempts = row.attempts + 1;
    const exhausted = attempts >= row.maxAttempts;
    return {
      ...row,
      attempts,
      status: exhausted ? "failed" : "pending",
      leaseOwner: null,
      leaseUntil: null,
      lastError: error.slice(0, 500),
      stage: exhausted ? "failed" : "retry",
      updatedAt: new Date(nowMs).toISOString(),
    };
  });
}
