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
};

export function toLibraryJob(job: Job): LibraryJob {
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
  return {
    id: job.id,
    name: job.customer.name.trim() || "Untitled",
    address: job.property.address.trim(),
    recordedAt,
    status,
    clips,
  };
}
