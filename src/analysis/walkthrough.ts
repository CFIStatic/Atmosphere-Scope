import { gpuAdapterReport, type GpuAdapterReport } from "@/analysis/adapters/gpu";
import { priceWithSerpApi } from "@/analysis/adapters/serpapi";
import { openaiKey, selectPricingProvider, type Env, type PricingSelection } from "@/analysis/config";
import { priceWithOpenAI } from "@/analysis/openai/pricing";
import { transcribeWithOpenAI, type TranscriptionResult } from "@/analysis/openai/transcribe";
import { identifyObjects, MAX_PRICED_OBJECTS, type IdentifiedObject } from "@/analysis/openai/vision";
import { sharedOfferCache, type OfferCache } from "@/analysis/offer-cache";
import { blankOffer, type FetchPageOptions, type ReplacementOffer } from "@/analysis/pricing-check";

export type WalkthroughAi = {
  transcription: TranscriptionResult;
  objects: IdentifiedObject[];
  objectNote: string;
  offers: ReplacementOffer[];
  pricing: PricingSelection;
  measurement: GpuAdapterReport;
};

export async function enrichMeasuredWalkthrough(input: {
  env?: Env;
  fetchImpl?: typeof fetch;
  now?: Date;
  video?: { filename: string; bytes: Uint8Array; mimeType: string } | null;
  frames?: { name: string; bytes: Uint8Array; mimeType: string }[];
  page?: FetchPageOptions;
  cache?: OfferCache;
}): Promise<WalkthroughAi> {
  const env = input.env ?? process.env;
  const fetchImpl = input.fetchImpl ?? fetch;
  const now = input.now ?? new Date();
  const pricing = selectPricingProvider(env);
  const measurement = gpuAdapterReport(env);
  const cache = input.cache ?? sharedOfferCache(env);
  const [transcription, vision] = await Promise.all([
    transcribeWithOpenAI(input.video ?? null, { env, fetchImpl }),
    identifyObjects(input.frames ?? [], { env, fetchImpl }),
  ]);
  const offers = await priceObjects(vision.objects, { env, fetchImpl, now, pricing, page: input.page, cache });
  return { transcription, objects: vision.objects, objectNote: vision.note, offers, pricing, measurement };
}

async function priceObjects(
  objects: IdentifiedObject[],
  options: { env: Env; fetchImpl: typeof fetch; now: Date; pricing: PricingSelection; page?: FetchPageOptions; cache: OfferCache },
): Promise<ReplacementOffer[]> {
  const chosen = objects.slice(0, MAX_PRICED_OBJECTS);
  if (!chosen.length) return [];
  if (!options.pricing.ready) return chosen.map((object) => blankOffer(object.name, options.pricing.reason));
  const key = openaiKey(options.env);
  const nowMs = options.now.getTime();
  return Promise.all(chosen.map(async (object) => {
    const cached = options.cache.get(options.pricing.id, object.name, nowMs);
    if (cached) return cached;
    const offer = options.pricing.id === "serpapi"
      ? await priceWithSerpApi(object.name, { apiKey: options.env.SERPAPI_API_KEY?.trim() ?? "", fetchImpl: options.fetchImpl, now: options.now, page: options.page })
      : await priceWithOpenAI(object.name, { apiKey: key, fetchImpl: options.fetchImpl, now: options.now, env: options.env, page: options.page });
    options.cache.set(options.pricing.id, object.name, offer, nowMs);
    return offer;
  }));
}
