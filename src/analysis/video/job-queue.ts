/**
 * Durable analysis queue. Local disk, or Supabase when STORAGE=supabase.
 * Lease columns follow Atmosphere's processing-job lease (20260905190000)
 * and proof analysis lease (20260905191000).
 * A claim or update touches one row, and only while that worker still holds
 * the lease, so two ticks cannot take the same job or clear someone else's lease.
 */

import { mkdir, open, readFile, rm, stat, writeFile } from "node:fs/promises";
import path from "node:path";
import { assertStorageReady, supabaseKey, type Env } from "@/analysis/config";
import { dataRoot } from "@/storage/paths";
import { claimNext, leaseIsFree, type AnalysisJobRow } from "./lease";

export type AnalysisJobPatch = Partial<Pick<AnalysisJobRow, "status" | "attempts" | "leaseOwner" | "leaseUntil" | "lastError" | "stage" | "updatedAt">>;

export type AnalysisJobStore = {
  list(): Promise<AnalysisJobRow[]>;
  save(rows: AnalysisJobRow[]): Promise<void>;
  claim(nowMs: number, owner: string, leaseMs: number): Promise<AnalysisJobRow | null>;
  /** Patch one row. When `owner` is set, skip the write if that owner no longer holds the lease. */
  update(id: string, patch: AnalysisJobPatch, owner?: string): Promise<boolean>;
  enqueue(row: AnalysisJobRow): Promise<void>;
};

function sameActive(row: AnalysisJobRow, incoming: AnalysisJobRow): boolean {
  return row.id === incoming.id || (row.jobId === incoming.jobId && row.mediaId === incoming.mediaId && row.status !== "complete" && row.status !== "failed");
}

function normalizeRow(row: AnalysisJobRow): AnalysisJobRow {
  return { ...row, orgId: row.orgId ?? null, actorEmail: row.actorEmail ?? null };
}

function serialGate() {
  let tail = Promise.resolve();
  return function exclusive<T>(fn: () => T | Promise<T>): Promise<T> {
    const run = tail.then(fn, fn);
    tail = run.then(() => undefined, () => undefined);
    return run;
  };
}

export function memoryStore(seed: AnalysisJobRow[] = []): AnalysisJobStore {
  let rows = seed.map((row) => normalizeRow(row));
  const exclusive = serialGate();
  return {
    async list() { return exclusive(() => rows.map((row) => ({ ...row }))); },
    async save(next) { await exclusive(() => { rows = next.map((row) => normalizeRow(row)); }); },
    async claim(nowMs, owner, leaseMs) {
      return exclusive(() => {
        const picked = claimNext(rows, nowMs, owner, leaseMs);
        if (!picked) return null;
        rows = picked.rows.map((row) => normalizeRow(row));
        return { ...picked.claimed };
      });
    },
    async update(id, patch, owner) {
      return exclusive(() => {
        const current = rows.find((row) => row.id === id);
        if (!current || (owner && current.leaseOwner !== owner)) return false;
        rows = rows.map((row) => row.id === id ? normalizeRow({ ...row, ...patch }) : row);
        return true;
      });
    },
    async enqueue(row) {
      await exclusive(() => {
        if (rows.some((item) => sameActive(item, row))) return;
        rows = [...rows, normalizeRow(row)];
      });
    },
  };
}

async function withQueueLock<T>(lockPath: string, fn: () => Promise<T>): Promise<T> {
  await mkdir(path.dirname(lockPath), { recursive: true });
  for (let attempt = 0; attempt < 50; attempt += 1) {
    try {
      const handle = await open(lockPath, "wx");
      try {
        return await fn();
      } finally {
        await handle.close();
        await rm(lockPath, { force: true });
      }
    } catch (error) {
      const code = error && typeof error === "object" && "code" in error ? String((error as { code?: string }).code) : "";
      if (code !== "EEXIST") throw error;
      try {
        const info = await stat(lockPath);
        if (Date.now() - info.mtimeMs > 15_000) await rm(lockPath, { force: true });
      } catch {
        // The lock was already released.
      }
      await new Promise((resolve) => setTimeout(resolve, 20));
    }
  }
  throw new Error("Analysis queue was busy.");
}

export function fileStore(root = dataRoot()): AnalysisJobStore {
  const file = path.join(root, "analysis-jobs.json");
  const lock = path.join(root, "analysis-jobs.lock");
  const read = async (): Promise<AnalysisJobRow[]> => {
    try {
      const raw = await readFile(file, "utf8");
      const parsed = JSON.parse(raw) as AnalysisJobRow[];
      return Array.isArray(parsed) ? parsed.map((row) => normalizeRow(row)) : [];
    } catch {
      return [];
    }
  };
  const write = async (rows: AnalysisJobRow[]) => {
    await mkdir(root, { recursive: true });
    await writeFile(file, JSON.stringify(rows.map((row) => normalizeRow(row)), null, 2));
  };
  return {
    list() { return withQueueLock(lock, read); },
    save(rows) { return withQueueLock(lock, () => write(rows)); },
    claim(nowMs, owner, leaseMs) {
      return withQueueLock(lock, async () => {
        const rows = await read();
        const picked = claimNext(rows, nowMs, owner, leaseMs);
        if (!picked) return null;
        await write(picked.rows);
        return picked.claimed;
      });
    },
    update(id, patch, owner) {
      return withQueueLock(lock, async () => {
        const rows = await read();
        const current = rows.find((row) => row.id === id);
        if (!current || (owner && current.leaseOwner !== owner)) return false;
        await write(rows.map((row) => row.id === id ? { ...row, ...patch } : row));
        return true;
      });
    },
    enqueue(row) {
      return withQueueLock(lock, async () => {
        const rows = await read();
        if (rows.some((item) => sameActive(item, row))) return;
        await write([...rows, row]);
      });
    },
  };
}

function restHeaders(key: string, extra?: Record<string, string>): HeadersInit {
  return { apikey: key, Authorization: `Bearer ${key}`, "Content-Type": "application/json", ...extra };
}

export async function updateJobRow(store: AnalysisJobStore, id: string, patch: AnalysisJobPatch, owner?: string): Promise<boolean> {
  return store.update(id, { ...patch, updatedAt: patch.updatedAt ?? new Date().toISOString() }, owner);
}

export function supabaseStore(env: Env, fetchImpl: typeof fetch): AnalysisJobStore {
  const url = env.SUPABASE_URL?.trim().replace(/\/$/, "") ?? "";
  const key = supabaseKey(env);
  const store: AnalysisJobStore = {
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
    async update(id, patch, owner) {
      const filters = [`id=eq.${encodeURIComponent(id)}`];
      if (owner) filters.push(`lease_owner=eq.${encodeURIComponent(owner)}`);
      const response = await fetchImpl(`${url}/rest/v1/analysis_jobs?${filters.join("&")}`, {
        method: "PATCH",
        headers: restHeaders(key, { Prefer: "return=representation" }),
        body: JSON.stringify(toPatch(patch)),
      });
      if (!response.ok) throw new Error(`Supabase analysis queue update failed (${response.status}).`);
      const updated = await response.json().catch(() => []);
      return Array.isArray(updated) && updated.length > 0;
    },
    async enqueue(row) {
      const rows = await store.list();
      if (rows.some((item) => sameActive(item, row))) return;
      const response = await fetchImpl(`${url}/rest/v1/analysis_jobs`, {
        method: "POST",
        headers: restHeaders(key, { Prefer: "resolution=merge-duplicates,return=minimal" }),
        body: JSON.stringify([toRow(row)]),
      });
      if (!response.ok) throw new Error(`Supabase analysis queue save failed (${response.status}).`);
    },
  };
  return store;
}

export function analysisJobStore(env: Env = process.env, fetchImpl: typeof fetch = fetch): AnalysisJobStore {
  return assertStorageReady(env).mode === "supabase" ? supabaseStore(env, fetchImpl) : fileStore();
}

export async function enqueueJob(store: AnalysisJobStore, row: AnalysisJobRow): Promise<void> {
  await store.enqueue(row);
}

export async function claimJob(store: AnalysisJobStore, nowMs: number, owner: string, leaseMs: number): Promise<AnalysisJobRow | null> {
  return store.claim(nowMs, owner, leaseMs);
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
