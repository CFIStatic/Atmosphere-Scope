import type { Job } from "@/domain/types";
import { authMode } from "@/auth/access";
import type { PublicSession } from "@/auth/access";
import { canMutateJobs, canSeeJob } from "@/auth/gate";
import { getActor, getRequestSession } from "@/auth/request-session";
import { getJob, listJobs } from "@/storage/job-store";
import { listJobShares } from "@/storage/shares";
import { membershipFor } from "@/storage/workspace-book";

function openCatalog(mode: "local" | "supabase", session: PublicSession | null) {
  return mode === "local" && !session;
}

async function viewerOrgId(): Promise<string | null> {
  const { actor } = await getActor();
  if (!actor) return null;
  try {
    const membership = await membershipFor(actor.userId);
    return membership?.org.id ?? null;
  } catch {
    return null;
  }
}

export async function listVisibleJobs(): Promise<Job[]> {
  const { mode, session } = await getRequestSession();
  const jobs = await listJobs();
  const shares = await listJobShares();
  const open = openCatalog(mode, session);
  const orgId = await viewerOrgId();
  return jobs.filter((job) => canSeeJob({
    openCatalog: open,
    role: session?.role ?? null,
    email: session?.email ?? "",
    jobId: job.id,
    jobOrgId: job.orgId ?? null,
    viewerOrgId: orgId,
    shares,
  }));
}

export async function loadVisibleJob(id: string): Promise<{ job: Job } | { error: string; status: number }> {
  const { mode, session } = await getRequestSession();
  if (mode === "supabase" && !session) return { error: "Sign in required.", status: 401 };
  const job = await getJob(id);
  if (!job) return { error: "Job not found.", status: 404 };
  const shares = await listJobShares();
  const visible = canSeeJob({
    openCatalog: openCatalog(mode, session),
    role: session?.role ?? null,
    email: session?.email ?? "",
    jobId: id,
    jobOrgId: job.orgId ?? null,
    viewerOrgId: await viewerOrgId(),
    shares,
  });
  if (!visible) return { error: "Job not found.", status: 404 };
  return { job };
}

export async function assertJobWriter(): Promise<{ ok: true } | { error: string; status: number }> {
  const { mode, session } = await getRequestSession();
  if (authMode() === "supabase" && !session) return { error: "Sign in required.", status: 401 };
  if (!canMutateJobs({ openCatalog: openCatalog(mode, session), role: session?.role ?? null })) {
    return { error: "This account can open shared jobs. It cannot change them.", status: 403 };
  }
  return { ok: true };
}
