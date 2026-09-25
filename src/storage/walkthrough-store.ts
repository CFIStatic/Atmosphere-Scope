import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import type { WalkthroughSnapshot } from "@/capture/snapshot";
import { openRecord, saveRecord, type WalkthroughRecord } from "@/domain/records";
import { assertStorageReady } from "@/analysis/config";
import { dataRoot } from "./paths";
import { readSupabaseDocument, writeSupabaseDocument } from "./supabase-store";

export async function getWalkthrough(id: string): Promise<WalkthroughRecord | null> {
  if (assertStorageReady().mode === "supabase") return readSupabaseDocument<WalkthroughRecord>("walkthroughs", id, process.env, fetch);
  try {
    return JSON.parse(await readFile(file(id), "utf8")) as WalkthroughRecord;
  } catch {
    return null;
  }
}

export async function storeWalkthrough(id: string, snapshot: WalkthroughSnapshot, videoKey: string | null): Promise<WalkthroughRecord> {
  const updatedAt = new Date().toISOString();
  const current = await getWalkthrough(id);
  const next = current ? saveRecord(current, snapshot, videoKey, updatedAt) : openRecord(id, snapshot, videoKey, updatedAt);
  await write(next);
  return next;
}

export async function putWalkthrough(record: WalkthroughRecord): Promise<WalkthroughRecord> {
  await write(record);
  return record;
}

async function write(record: WalkthroughRecord): Promise<void> {
  if (assertStorageReady().mode === "supabase") {
    await writeSupabaseDocument("walkthroughs", record.id, record, record.updatedAt, process.env, fetch);
    return;
  }
  await mkdir(path.dirname(file(record.id)), { recursive: true });
  await writeFile(file(record.id), JSON.stringify(record, null, 2));
}

function file(id: string): string {
  return path.join(dataRoot(), "walkthroughs", `${id}.json`);
}
