import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import type { WalkthroughSnapshot } from "@/capture/snapshot";
import { openRecord, saveRecord, type WalkthroughRecord } from "@/domain/records";
import { assertStorageReady } from "@/analysis/config";
import { dataRoot } from "./paths";
import { readSupabaseDocument, writeSupabaseDocument } from "./supabase-store";

export async function getWalkthrough(id: string): Promise<WalkthroughRecord | null> {
  if (!isSafeWalkthroughId(id)) return null;
  if (assertStorageReady().mode === "supabase") return readSupabaseDocument<WalkthroughRecord>("walkthroughs", id, process.env, fetch);
  try {
    return JSON.parse(await readFile(file(id), "utf8")) as WalkthroughRecord;
  } catch {
    return null;
  }
}

export async function storeWalkthrough(id: string, snapshot: WalkthroughSnapshot, videoKey: string | null): Promise<WalkthroughRecord> {
  const safe = assertWalkthroughId(id);
  const updatedAt = new Date().toISOString();
  const current = await getWalkthrough(safe);
  const next = current ? saveRecord(current, snapshot, videoKey, updatedAt) : openRecord(safe, snapshot, videoKey, updatedAt);
  await write(next);
  return next;
}

export async function putWalkthrough(record: WalkthroughRecord): Promise<WalkthroughRecord> {
  const safe = assertWalkthroughId(record.id);
  const next = safe === record.id ? record : { ...record, id: safe };
  await write(next);
  return next;
}

async function write(record: WalkthroughRecord): Promise<void> {
  const id = assertWalkthroughId(record.id);
  const stored = id === record.id ? record : { ...record, id };
  if (assertStorageReady().mode === "supabase") {
    await writeSupabaseDocument("walkthroughs", stored.id, stored, stored.updatedAt, process.env, fetch);
    return;
  }
  await mkdir(path.dirname(file(stored.id)), { recursive: true });
  await writeFile(file(stored.id), JSON.stringify(stored, null, 2));
}

function file(id: string): string {
  const safe = assertWalkthroughId(id);
  const root = path.resolve(dataRoot(), "walkthroughs");
  const target = path.resolve(root, `${safe}.json`);
  const relative = path.relative(root, target);
  if (relative.startsWith("..") || path.isAbsolute(relative)) throw new Error("Walkthrough id is not valid.");
  return target;
}

function isSafeWalkthroughId(id: string): boolean {
  return /^[A-Za-z0-9][A-Za-z0-9_-]{0,80}$/.test(id);
}

function assertWalkthroughId(id: string): string {
  const trimmed = id.trim();
  if (!isSafeWalkthroughId(trimmed)) throw new Error("Walkthrough id is not valid.");
  return trimmed;
}
