/** Labels shown on the job file. The queue row is the source of truth. */

export type PublicAnalysisStatus = "queued" | "extracting" | "inventorying" | "assessing" | "pricing" | "done" | "failed";

export const ANALYSIS_STATUS_LABEL: Record<PublicAnalysisStatus, string> = {
  queued: "Queued",
  extracting: "Extracting frames",
  inventorying: "Inventorying",
  assessing: "Assessing",
  pricing: "Pricing",
  done: "Done",
  failed: "Failed",
};

export function publicAnalysisStatus(row: { status: string; stage: string | null }): PublicAnalysisStatus {
  if (row.status === "failed") return "failed";
  if (row.status === "complete") return "done";
  if (row.stage === "extracting" || row.stage === "inventorying" || row.stage === "assessing" || row.stage === "pricing") return row.stage;
  return "queued";
}

export function analysisEventSummary(status: PublicAnalysisStatus, error?: string | null): string {
  if (status === "failed") return error ? `Object inventory failed. ${error}` : "Object inventory failed.";
  if (status === "done") return "Object inventory finished.";
  if (status === "queued") return "Video queued for object inventory.";
  return ANALYSIS_STATUS_LABEL[status];
}
