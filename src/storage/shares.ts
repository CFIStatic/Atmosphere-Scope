import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { supabaseKey } from "@/analysis/config";
import { authMode } from "@/auth/access";
import { dataRoot } from "./paths";

export type JobShare = { jobId: string; email: string };

function filePath() {
  return path.join(dataRoot(), "job-shares.json");
}

export async function listJobShares(): Promise<JobShare[]> {
  try {
    const raw = await readFile(filePath(), "utf8");
    const parsed = JSON.parse(raw) as JobShare[];
    if (!Array.isArray(parsed)) return [];
    return parsed.filter((share) => share.jobId && share.email);
  } catch {
    return [];
  }
}

export async function addJobShare(jobId: string, email: string): Promise<JobShare> {
  const share = { jobId: jobId.trim(), email: email.trim().toLowerCase() };
  if (!share.jobId || !share.email.includes("@")) throw new Error("A job and an email are required.");
  if (authMode() === "supabase") await writeSupabaseShare(share);
  const shares = await listJobShares();
  const next = shares.filter((item) => !(item.jobId === share.jobId && item.email.toLowerCase() === share.email));
  next.push(share);
  await mkdir(path.dirname(filePath()), { recursive: true });
  await writeFile(filePath(), JSON.stringify(next, null, 2));
  return share;
}

async function writeSupabaseShare(share: JobShare) {
  const url = process.env.SUPABASE_URL?.trim().replace(/\/$/, "") ?? "";
  const key = supabaseKey();
  if (!url || !key) throw new Error("STORAGE=supabase needs SUPABASE_URL and the service role key before a job can be shared.");
  const response = await fetch(`${url}/rest/v1/job_shares`, {
    method: "POST",
    headers: {
      apikey: key,
      Authorization: `Bearer ${key}`,
      "Content-Type": "application/json",
      Prefer: "resolution=merge-duplicates,return=minimal",
    },
    body: JSON.stringify({ job_id: share.jobId, email: share.email }),
  });
  if (!response.ok) {
    throw new Error("The share was not saved. Run the job_shares SQL in docs/STORAGE.md, then try again.");
  }
}
