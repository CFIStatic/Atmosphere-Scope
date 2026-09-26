/**
 * Durable analysis queue. Local disk, or Supabase when STORAGE=supabase.
 * Lease columns follow Atmosphere's processing-job lease (20260905190000)
 * and proof analysis lease (20260905191000).
 */

import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { assertStorageReady, supabaseKey, type Env } from "@/analysis/config";
import { dataRoot } from "@/storage/paths";
import { claimNext, leaseIsFree, type AnalysisJobRow } from "./lease";

export type AnalysisJobPatch = Partial<Pick<AnalysisJobRow, "status" | "attempts" | "leaseOwner" | "leaseUntil" | "lastError" | "stage" | "updatedAt">>;

export type AnalysisJobStore = {
  list(): Promise<AnalysisJobRow[]>;
  save(rows: AnalysisJobRow[]): Promise<void>;
  /** Compare-and-swap claim. Supabase uses this so two instances cannot take the same row. */
  claim?(nowMs: number, owner: string, leaseMs: number): Promise<AnalysisJobRow | null>;
  update?(id: string, patch: AnalysisJobPatch): Promise<void>;
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
        return Array.isArray(parsed) ? parsed.map((row) => ({ ...row, orgId: row.orgId ?? null, actorEmail: row.actorEmail ?? null })) : [];
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

export async function updateJobRow(store: AnalysisJobStore, id: string, patch: AnalysisJobPatch): Promise<void> {
  const next = { ...patch, updatedAt: patch.updatedAt ?? new Date().toISOString() };
  if (store.update) {
    await store.update(id, next);
    return;
  }
  const rows = await store.list();
  await store.save(rows.map((row) => (row.id === id ? { ...row, ...next } : row)));
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
    async claim(nowMs, owner, leaseMs) {
      const nowIso = new Date(nowMs).toISOString();
      const until = new Date(nowMs + leaseMs).toISOString();
      const list = await fetchImpl(`${url}/rest/v1/analysis_jobs?select=*&status=in.(pending,running)&order=updated_at.asc`, { headers: restHeaders(key) });
      if (!list.ok) throw new Error(`Supabase analysis queue list failed (${list.status}).`);
      const candidates = ((await list.json()) as Record<string, unknown>[]).map(fromRow);
      for (const row of candidates) {
        if (!leaseIsFree(row, nowMs) || row.attempts >= row.maxAttempts) continue;
        const filter = `id=eq.${encodeURIComponent(row.id)}&status=in.(pending,running)&or=(lease_until.is.null,lease_until.lte.${encodeURIComponent(nowIso)})`;
        const patched = await fetchImpl(`${url}/rest/v1/analysis_jobs?${filter}`, {
          method: "PATCH",
          headers: restHeaders(key, { Prefer: "return=representation" }),
          body: JSON.stringify({
            status: "running",
            lease_owner: owner,
            lease_until: until,
            stage: row.stage ?? "queued",
            updated_at: nowIso,
          }),
        });
        if (!patched.ok) continue;
        const updated = (await patched.json()) as Record<string, unknown>[];
        if (Array.isArray(updated) && updated[0]) return fromRow(updated[0]);
      }
      return null;
    },
    async update(id, patch) {
      const response = await fetchImpl(`${url}/rest/v1/analysis_jobs?id=eq.${encodeURIComponent(id)}`, {
        method: "PATCH",
        headers: restHeaders(key, { Prefer: "return=minimal" }),
        body: JSON.stringify(toPatch(patch)),
      });
      if (!response.ok) throw new Error(`Supabase analysis queue update failed (${response.status}).`);
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
  if (store.claim) return store.claim(nowMs, owner, leaseMs);
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
    orgId: row.org_id == null ? null : String(row.org_id),
    actorEmail: row.actor_email == null ? null : String(row.actor_email),
    updatedAt: String(row.updated_at ?? new Date().toISOString()),
  };
}

function toPatch(patch: AnalysisJobPatch): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  if (patch.status != null) out.status = patch.status;
  if (patch.attempts != null) out.attempts = patch.attempts;
  if ("leaseOwner" in patch) out.lease_owner = patch.leaseOwner;
  if ("leaseUntil" in patch) out.lease_until = patch.leaseUntil;
  if ("lastError" in patch) out.last_error = patch.lastError;
  if ("stage" in patch) out.stage = patch.stage;
  if (patch.updatedAt != null) out.updated_at = patch.updatedAt;
  return out;
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
    org_id: row.orgId,
    actor_email: row.actorEmail,
    updated_at: row.updatedAt,
  };
}
