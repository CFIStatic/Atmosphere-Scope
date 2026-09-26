import type { Job, MediaAsset } from "@/domain/types";
import { supabaseKey, type Env } from "@/analysis/config";

const BUCKET = "media";

type Deps = { env: Env; fetchImpl: typeof fetch };

type JobRow = { document: Job; org_id?: string | null };

function jobFromRow(row: JobRow): Job {
  const orgId = row.document.orgId ?? row.org_id ?? null;
  if (!orgId) return row.document;
  return { ...row.document, orgId };
}

export async function listSupabaseJobs(env: Env, fetchImpl: typeof fetch): Promise<Job[]> {
  const { url, key } = required(env);
  const response = await fetchImpl(`${url}/rest/v1/jobs?select=document,org_id&order=updated_at.desc`, { headers: restHeaders(key) });
  if (!response.ok) throw new Error(`Supabase jobs list failed (${response.status}).`);
  const rows = (await response.json()) as JobRow[];
  return rows.map(jobFromRow);
}

export async function getSupabaseJob(id: string, env: Env, fetchImpl: typeof fetch): Promise<Job | null> {
  const { url, key } = required(env);
  const response = await fetchImpl(`${url}/rest/v1/jobs?id=eq.${encodeURIComponent(id)}&select=document,org_id`, { headers: restHeaders(key) });
  if (!response.ok) throw new Error(`Supabase job read failed (${response.status}).`);
  const rows = (await response.json()) as JobRow[];
  return rows[0] ? jobFromRow(rows[0]) : null;
}

export async function saveSupabaseJob(job: Job, env: Env, fetchImpl: typeof fetch): Promise<Job> {
  const { url, key } = required(env);
  const next = { ...job, updatedAt: new Date().toISOString() };
  const response = await fetchImpl(`${url}/rest/v1/jobs`, {
    method: "POST",
    headers: restHeaders(key, { Prefer: "resolution=merge-duplicates,return=minimal" }),
    body: JSON.stringify({ id: next.id, document: next, org_id: next.orgId ?? null, updated_at: next.updatedAt }),
  });
  if (!response.ok) throw new Error(`Supabase job save failed (${response.status}).`);
  return next;
}

export async function deleteSupabaseJob(id: string, env: Env, fetchImpl: typeof fetch): Promise<void> {
  const { url, key } = required(env);
  const response = await fetchImpl(`${url}/rest/v1/jobs?id=eq.${encodeURIComponent(id)}`, { method: "DELETE", headers: restHeaders(key) });
  if (!response.ok) throw new Error(`Supabase job delete failed (${response.status}).`);
  const media = await fetchImpl(`${url}/storage/v1/object/${BUCKET}`, {
    method: "DELETE",
    headers: restHeaders(key),
    body: JSON.stringify({ prefixes: [id] }),
  });
  if (!media.ok && media.status !== 404) throw new Error(`Supabase media delete failed (${media.status}).`);
}

export async function saveSupabaseMedia(jobId: string, media: MediaAsset, bytes: Uint8Array, deps: Deps): Promise<string> {
  const { url, key } = required(deps.env);
  const objectKey = `${jobId}/${media.id}`;
  const response = await deps.fetchImpl(`${url}/storage/v1/object/${BUCKET}/${encodePath(objectKey)}`, {
    method: "POST",
    headers: {
      ...restHeaders(key),
      "Content-Type": media.mimeType || "application/octet-stream",
      "x-upsert": "true",
    },
    body: Buffer.from(bytes),
  });
  if (!response.ok) throw new Error(`Supabase media upload failed (${response.status}).`);
  return objectKey;
}

export async function readSupabaseMedia(storageKey: string, env: Env, fetchImpl: typeof fetch): Promise<Buffer | null> {
  const { url, key } = required(env);
  const response = await fetchImpl(`${url}/storage/v1/object/${BUCKET}/${encodePath(storageKey)}`, { headers: restHeaders(key) });
  if (response.status === 404) return null;
  if (!response.ok) throw new Error(`Supabase media read failed (${response.status}).`);
  return Buffer.from(await response.arrayBuffer());
}

export async function readSupabaseDocument<T>(table: string, id: string, env: Env, fetchImpl: typeof fetch): Promise<T | null> {
  const { url, key } = required(env);
  const response = await fetchImpl(`${url}/rest/v1/${table}?id=eq.${encodeURIComponent(id)}&select=document`, { headers: restHeaders(key) });
  if (!response.ok) throw new Error(`Supabase ${table} read failed (${response.status}).`);
  const rows = (await response.json()) as { document: T }[];
  return rows[0]?.document ?? null;
}

export async function writeSupabaseDocument(table: string, id: string, document: unknown, updatedAt: string, env: Env, fetchImpl: typeof fetch): Promise<void> {
  const { url, key } = required(env);
  const response = await fetchImpl(`${url}/rest/v1/${table}`, {
    method: "POST",
    headers: restHeaders(key, { Prefer: "resolution=merge-duplicates,return=minimal" }),
    body: JSON.stringify({ id, document, updated_at: updatedAt }),
  });
  if (!response.ok) throw new Error(`Supabase ${table} save failed (${response.status}).`);
}

function required(env: Env): { url: string; key: string } {
  const url = env.SUPABASE_URL?.trim().replace(/\/$/, "") ?? "";
  const key = supabaseKey(env);
  if (!url || !key) {
    throw new Error("STORAGE=supabase requires SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY (or SUPABASE_SECRET_KEY).");
  }
  return { url, key };
}

function restHeaders(key: string, extra?: Record<string, string>): Record<string, string> {
  return { apikey: key, Authorization: `Bearer ${key}`, "Content-Type": "application/json", ...extra };
}

function encodePath(key: string): string {
  return key.split("/").map((part) => encodeURIComponent(part)).join("/");
}
