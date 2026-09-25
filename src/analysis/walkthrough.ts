import { gpuAdapterReport, type GpuAdapterReport } from "@/analysis/adapters/gpu";
import { priceWithSerpApi } from "@/analysis/adapters/serpapi";
import { openaiKey, selectPricingProvider, type Env, type PricingSelection } from "@/analysis/config";
import { priceWithOpenAI } from "@/analysis/openai/pricing";
import { transcribeWithOpenAI, type TranscriptionResult } from "@/analysis/openai/transcribe";
import { identifyObjects, MAX_PRICED_OBJECTS, type IdentifiedObject } from "@/analysis/openai/vision";
import { blankOffer, type ReplacementOffer } from "@/analysis/pricing-check";

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
}): Promise<WalkthroughAi> {
  const env = input.env ?? process.env;
  const fetchImpl = input.fetchImpl ?? fetch;
  const now = input.now ?? new Date();
  const pricing = selectPricingProvider(env);
  const measurement = gpuAdapterReport(env);
  const [transcription, vision] = await Promise.all([
    transcribeWithOpenAI(input.video ?? null, { env, fetchImpl }),
    identifyObjects(input.frames ?? [], { env, fetchImpl }),
  ]);
  const offers = await priceObjects(vision.objects, { env, fetchImpl, now, pricing });
  return { transcription, objects: vision.objects, objectNote: vision.note, offers, pricing, measurement };
}

async function priceObjects(
  objects: IdentifiedObject[],
  options: { env: Env; fetchImpl: typeof fetch; now: Date; pricing: PricingSelection },
): Promise<ReplacementOffer[]> {
  const chosen = objects.slice(0, MAX_PRICED_OBJECTS);
  if (!chosen.length) return [];
  if (!options.pricing.ready) return chosen.map((object) => blankOffer(object.name, options.pricing.reason));
  const key = openaiKey(options.env);
  return Promise.all(chosen.map(async (object) => {
    if (options.pricing.id === "serpapi") {
      return priceWithSerpApi(object.name, { apiKey: options.env.SERPAPI_API_KEY?.trim() ?? "", fetchImpl: options.fetchImpl, now: options.now });
    }
    return priceWithOpenAI(object.name, { apiKey: key, fetchImpl: options.fetchImpl, now: options.now, env: options.env });
  }));
}
