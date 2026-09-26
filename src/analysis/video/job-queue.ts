/**
 * Durable analysis queue. Local disk, or Supabase when STORAGE=supabase.
 * Lease columns follow Atmosphere's processing-job lease (20260905190000)
 * and proof analysis lease (20260905191000).
 */

import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { assertStorageReady, supabaseKey, type Env } from "@/analysis/config";
import { dataRoot } from "@/storage/paths";
import { claimNext, type AnalysisJobRow } from "./lease";

export type AnalysisJobStore = {
  list(): Promise<AnalysisJobRow[]>;
  save(rows: AnalysisJobRow[]): Promise<void>;
};

export function memoryStore(seed: AnalysisJobRow[] = []): AnalysisJobStore {
  let rows = seed.map((row) => ({ ...row }));
  return {
    async list() { return rows.map((row) => ({ ...row })); },
    async save(next) { rows = next.map((row) => ({ ...row })); },
  };
}

export function fileStore(root = dataRoot()): AnalysisJobStore {
  const file = path.join(root, "analysis-jobs.json");
  return {
    async list() {
      try {
        const raw = await readFile(file, "utf8");
        const parsed = JSON.parse(raw) as AnalysisJobRow[];
        return Array.isArray(parsed) ? parsed : [];
      } catch {
        return [];
      }
    },
    async save(rows) {
      await mkdir(root, { recursive: true });
      await writeFile(file, JSON.stringify(rows, null, 2));
    },
  };
}

function restHeaders(key: string, extra?: Record<string, string>): HeadersInit {
  return { apikey: key, Authorization: `Bearer ${key}`, "Content-Type": "application/json", ...extra };
}

export function supabaseStore(env: Env, fetchImpl: typeof fetch): AnalysisJobStore {
  const url = env.SUPABASE_URL?.trim().replace(/\/$/, "") ?? "";
  const key = supabaseKey(env);
  return {
    async list() {
      const response = await fetchImpl(`${url}/rest/v1/analysis_jobs?select=*`, { headers: restHeaders(key) });
      if (!response.ok) throw new Error(`Supabase analysis queue list failed (${response.status}).`);
      const rows = (await response.json()) as Record<string, unknown>[];
      return rows.map(fromRow);
    },
    async save(rows) {
      const response = await fetchImpl(`${url}/rest/v1/analysis_jobs`, {
        method: "POST",
        headers: restHeaders(key, { Prefer: "resolution=merge-duplicates,return=minimal" }),
        body: JSON.stringify(rows.map(toRow)),
      });
      if (!response.ok) throw new Error(`Supabase analysis queue save failed (${response.status}).`);
    },
  };
}

export function analysisJobStore(env: Env = process.env, fetchImpl: typeof fetch = fetch): AnalysisJobStore {
  return assertStorageReady(env).mode === "supabase" ? supabaseStore(env, fetchImpl) : fileStore();
}

export async function enqueueJob(store: AnalysisJobStore, row: AnalysisJobRow): Promise<void> {
  const rows = await store.list();
  if (rows.some((item) => item.id === row.id || (item.jobId === row.jobId && item.mediaId === row.mediaId && item.status !== "complete" && item.status !== "failed"))) return;
  await store.save([...rows, row]);
}

export async function claimJob(store: AnalysisJobStore, nowMs: number, owner: string, leaseMs: number): Promise<AnalysisJobRow | null> {
  const rows = await store.list();
  const claimed = claimNext(rows, nowMs, owner, leaseMs);
  if (!claimed) return null;
  await store.save(claimed.rows);
  return claimed.claimed;
}

function fromRow(row: Record<string, unknown>): AnalysisJobRow {
  return {
    id: String(row.id),
    jobId: String(row.job_id),
    mediaId: row.media_id == null ? null : String(row.media_id),
    status: row.status === "running" || row.status === "complete" || row.status === "failed" ? row.status : "pending",
    attempts: Number(row.attempts ?? 0),
    maxAttempts: Number(row.max_attempts ?? 3),
    leaseOwner: row.lease_owner == null ? null : String(row.lease_owner),
    leaseUntil: row.lease_until == null ? null : String(row.lease_until),
    lastError: row.last_error == null ? null : String(row.last_error),
    stage: row.stage == null ? null : String(row.stage),
    updatedAt: String(row.updated_at ?? new Date().toISOString()),
  };
}

function toRow(row: AnalysisJobRow): Record<string, unknown> {
  return {
    id: row.id,
    job_id: row.jobId,
    media_id: row.mediaId,
    status: row.status,
    attempts: row.attempts,
    max_attempts: row.maxAttempts,
    lease_owner: row.leaseOwner,
    lease_until: row.leaseUntil,
    last_error: row.lastError,
    stage: row.stage,
    updated_at: row.updatedAt,
  };
}
