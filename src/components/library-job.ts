import { jobCardSentence } from "@/domain/assist";
import type { Job } from "@/domain/types";

export type LibraryClip = {
  id: string;
  label: string;
  createdAt: string;
  durationMs?: number;
};

export type LibraryJob = {
  id: string;
  name: string;
  address: string;
  recordedAt: string;
  status: "recorded" | "waiting" | "recording";
  clips: LibraryClip[];
  attention: boolean;
  unpriced: number;
  total: number | null;
};

export function toLibraryJob(job: Job, viewerIsCustomer = false): LibraryJob {
  const clips = job.media.map((item) => ({
    id: item.id,
    label: item.label.trim() || item.filename.trim() || "Clip",
    createdAt: item.createdAt,
    durationMs: item.durationMs,
  }));
  const recordedAt = clips.map((clip) => clip.createdAt).sort().at(-1) || job.updatedAt || job.createdAt;
  const status = job.processing.status === "running"
    ? "recording"
    : clips.length > 0
      ? "recorded"
      : "waiting";
  const version = job.estimates.find((item) => item.id === job.activeEstimateId) ?? job.estimates.at(-1);
  const unpriced = version?.pricedLines.filter((line) => line.unpricedReason !== "Excluded from price." && (line.unitPrice == null || line.unpricedReason)).length ?? 0;
  const total = version?.totals.supportedTotal ?? null;
  return {
    id: job.id,
    name: job.customer.name.trim() || "Untitled",
    address: job.property.address.trim(),
    recordedAt,
    status,
    clips,
    unpriced,
    total,
    attention: jobCardSentence({
      customer: job.customer.name,
      concern: job.concern,
      status: version?.status ?? null,
      unpriced,
      viewerIsCustomer,
    }).needsAttention,
  };
}
