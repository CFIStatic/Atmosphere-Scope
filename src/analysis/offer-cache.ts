import type { Env } from "@/analysis/config";
import type { ReplacementOffer } from "@/analysis/pricing-check";

export function normalizeItemKey(query: string): string {
  return query.normalize("NFKC").toLowerCase().replace(/[^a-z0-9]+/g, " ").trim();
}

export function priceCacheTtlMs(env: Env = process.env): number {
  const parsed = Number(env.PRICE_CACHE_TTL_SECONDS ?? 21_600);
  if (!Number.isFinite(parsed) || parsed < 0) return 21_600_000;
  return Math.floor(parsed * 1000);
}

export type OfferCache = {
  get: (provider: string, query: string, now: number) => ReplacementOffer | null;
  set: (provider: string, query: string, offer: ReplacementOffer, now: number) => void;
};

export function createOfferCache(ttlMs: number): OfferCache {
  const entries = new Map<string, { at: number; offer: ReplacementOffer }>();
  return {
    get(provider, query, now) {
      const key = cacheKey(provider, query);
      if (!key) return null;
      const hit = entries.get(key);
      if (!hit) return null;
      if (now - hit.at >= ttlMs) {
        entries.delete(key);
        return null;
      }
      const note = hit.offer.note.includes("Cached lookup.") ? hit.offer.note : `${hit.offer.note} Cached lookup.`;
      return { ...hit.offer, note };
    },
    set(provider, query, offer, now) {
      if (ttlMs <= 0) return;
      const key = cacheKey(provider, query);
      if (!key) return;
      entries.set(key, { at: now, offer });
    },
  };
}

let shared: OfferCache | null = null;
let sharedTtl = -1;

export function sharedOfferCache(env: Env = process.env): OfferCache {
  const ttl = priceCacheTtlMs(env);
  if (!shared || sharedTtl !== ttl) {
    shared = createOfferCache(ttl);
    sharedTtl = ttl;
  }
  return shared;
}

function cacheKey(provider: string, query: string): string {
  const item = normalizeItemKey(query);
  return item ? `${provider}:${item}` : "";
}
