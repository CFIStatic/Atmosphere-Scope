import type { Job } from "@/domain/types";

/** Older job files predate object inventory. Fill the fields the UI reads. */
export function normalizeJob(job: Job): Job {
  return {
    ...job,
    objects: Array.isArray(job.objects) ? job.objects : [],
    analysisCost: job.analysisCost ?? null,
  };
}
