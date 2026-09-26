import type { Job } from "@/domain/types";
import { getActor } from "@/auth/request-session";
import { membershipFor } from "@/storage/workspace-book";

export async function assignJobOrg(job: Job): Promise<Job> {
  if (job.orgId) return job;
  const { actor } = await getActor();
  if (!actor) return job;
  try {
    const membership = await membershipFor(actor.userId);
    if (!membership) return job;
    return { ...job, orgId: membership.org.id };
  } catch {
    return job;
  }
}
