import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { STARTER_CATALOG, nextCatalogVersion, type CatalogItem, type CatalogVersion } from "@/domain/catalog";
import { STARTER_RATES, type RateBook } from "@/domain/estimate-engine";
import { assertStorageReady } from "@/analysis/config";
import { dataRoot } from "./paths";
import { readSupabaseDocument, writeSupabaseDocument } from "./supabase-store";

type Stored = { catalogs: CatalogVersion[]; rates: RateBook };

export async function readEstimateStore(): Promise<Stored> {
  if (assertStorageReady().mode === "supabase") {
    return (await readSupabaseDocument<Stored>("estimate_store", "current", process.env, fetch)) ?? fresh();
  }
  try {
    const raw = await readFile(file(), "utf8");
    const parsed = JSON.parse(raw) as Stored;
    if (!parsed.catalogs?.length || !parsed.rates) return fresh();
    return parsed;
  } catch {
    return fresh();
  }
}

export async function currentCatalog(): Promise<CatalogVersion> {
  const stored = await readEstimateStore();
  return stored.catalogs[stored.catalogs.length - 1];
}

export async function publishCatalog(items: CatalogItem[], publishedAt: string): Promise<CatalogVersion> {
  const stored = await readEstimateStore();
  const current = stored.catalogs[stored.catalogs.length - 1];
  const next = nextCatalogVersion(current, items, publishedAt);
  stored.catalogs.push(next);
  await write(stored);
  return next;
}

export async function currentRates(): Promise<RateBook> {
  return (await readEstimateStore()).rates;
}

export async function saveRates(input: Omit<RateBook, "id" | "version">): Promise<RateBook> {
  const stored = await readEstimateStore();
  const next: RateBook = { ...input, id: `rates-${stored.rates.version + 1}`, version: stored.rates.version + 1 };
  stored.rates = next;
  await write(stored);
  return next;
}

function fresh(): Stored {
  return { catalogs: [STARTER_CATALOG], rates: STARTER_RATES };
}

function file(): string {
  return path.join(dataRoot(), "estimate-store.json");
}

async function write(stored: Stored): Promise<void> {
  if (assertStorageReady().mode === "supabase") {
    await writeSupabaseDocument("estimate_store", "current", stored, new Date().toISOString(), process.env, fetch);
    return;
  }
  const target = file();
  await mkdir(path.dirname(target), { recursive: true });
  await writeFile(target, JSON.stringify(stored, null, 2));
}
