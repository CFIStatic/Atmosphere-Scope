import { mkdir, readFile, readdir, writeFile, rm } from "node:fs/promises";
import path from "node:path";
import type { Job, MediaAsset } from "@/domain/types";
import { normalizeJob } from "@/domain/job-shape";
import { assertStorageReady } from "@/analysis/config";
import { dataRoot } from "./paths";
import { deleteSupabaseJob, getSupabaseJob, listSupabaseJobs, readSupabaseMedia, saveSupabaseJob, saveSupabaseMedia } from "./supabase-store";

function places() {
  const root = dataRoot();
  return { jobsDir: path.join(root, "jobs"), mediaDir: path.join(root, "media") };
}

async function ensure() {
  const { jobsDir, mediaDir } = places();
  await mkdir(jobsDir, { recursive: true });
  await mkdir(mediaDir, { recursive: true });
  return { jobsDir, mediaDir };
}

export async function listJobs(): Promise<Job[]> {
  if (assertStorageReady().mode === "supabase") return (await listSupabaseJobs(process.env, fetch)).map(normalizeJob);
  const { jobsDir } = await ensure();
  const files = await readdir(jobsDir);
  const jobs: Job[] = [];
  for (const file of files) {
    if (!file.endsWith(".json")) continue;
    const raw = await readFile(path.join(jobsDir, file), "utf8");
    jobs.push(normalizeJob(JSON.parse(raw) as Job));
  }
  return jobs.sort((a, b) => b.updatedAt.localeCompare(a.updatedAt));
}

export async function getJob(id: string): Promise<Job | null> {
  if (assertStorageReady().mode === "supabase") {
    const job = await getSupabaseJob(id, process.env, fetch);
    return job ? normalizeJob(job) : null;
  }
  const { jobsDir } = await ensure();
  try {
    const raw = await readFile(path.join(jobsDir, `${id}.json`), "utf8");
    return normalizeJob(JSON.parse(raw) as Job);
  } catch {
    return null;
  }
}

export async function saveJob(job: Job): Promise<Job> {
  if (assertStorageReady().mode === "supabase") return saveSupabaseJob(job, process.env, fetch);
  const { jobsDir } = await ensure();
  const next = { ...job, updatedAt: new Date().toISOString() };
  await writeFile(path.join(jobsDir, `${job.id}.json`), JSON.stringify(next, null, 2));
  return next;
}

export async function saveMediaFile(jobId: string, media: MediaAsset, bytes: Buffer): Promise<string> {
  if (assertStorageReady().mode === "supabase") return saveSupabaseMedia(jobId, media, bytes, { env: process.env, fetchImpl: fetch });
  const { mediaDir } = await ensure();
  const key = path.join(jobId, media.id);
  const absolute = path.join(mediaDir, key);
  await mkdir(path.dirname(absolute), { recursive: true });
  await writeFile(absolute, bytes);
  return key;
}

export async function readMediaFile(storageKey: string): Promise<Buffer | null> {
  if (assertStorageReady().mode === "supabase") return readSupabaseMedia(storageKey, process.env, fetch);
  try {
    return await readFile(path.join(places().mediaDir, storageKey));
  } catch {
    return null;
  }
}

export async function deleteJob(id: string): Promise<void> {
  if (assertStorageReady().mode === "supabase") {
    await deleteSupabaseJob(id, process.env, fetch);
    return;
  }
  const { jobsDir, mediaDir } = places();
  await rm(path.join(jobsDir, `${id}.json`), { force: true });
  await rm(path.join(mediaDir, id), { recursive: true, force: true });
}
