import { analysisMode, inventoryVisionModel, selectMeasurementBackend, selectPricingProvider, selectStorage, triageVisionModel, visionModel, type Env } from "@/analysis/config";
import { expectedModeMinuteUsd } from "@/analysis/video/cost";

export type ProviderRow = {
  stage: string;
  env: string | null;
  ready: boolean;
  provider: string;
  cost: string;
  note: string;
};

export function providerStatus(env: Env = process.env): ProviderRow[] {
  const openai = Boolean(env.OPENAI_API_KEY?.trim());
  const pricing = selectPricingProvider(env);
  const measurement = selectMeasurementBackend(env);
  const storage = selectStorage(env);
  const transcribeModel = env.OPENAI_TRANSCRIBE_MODEL?.trim() || "gpt-4o-mini-transcribe";
  const triage = triageVisionModel(env);
  const inventory = inventoryVisionModel(env);
  const mode = analysisMode(env);
  const cheap = expectedModeMinuteUsd("cheap");
  const cascade = expectedModeMinuteUsd("cascade");
  const strong = expectedModeMinuteUsd("strong");
  const notes = visionModel(env);
  return [
    {
      stage: "Room measurement",
      env: measurement.requested === "local" ? null : "MEASUREMENT_BACKEND",
      ready: true,
      provider: "Local OpenCV ChArUco solve",
      cost: "$0",
      note: measurement.note,
    },
    {
      stage: "Transcription",
      env: "OPENAI_API_KEY",
      ready: openai,
      provider: `OpenAI ${transcribeModel}`,
      cost: "a few tenths of a cent per minute; whisper-1 is about $0.006/min",
      note: openai ? "Key is set. Speech is not a measurement." : "Key missing. Narration is not invented.",
    },
    {
      stage: "Object identification",
      env: "OPENAI_API_KEY",
      ready: openai,
      provider: `OpenAI ${mode} mode, triage ${triage}, confirmation ${inventory}, ${notes} keyframe notes`,
      cost: `planning estimate about $${cascade.totalUsd.toFixed(2)}/min cascade, $${strong.totalUsd.toFixed(2)}/min strong, $${cheap.totalUsd.toFixed(2)}/min cheap, at 12 distinct frames`,
      note: openai ? `Key is set. This process is in ${mode} mode. Names can be wrong. Vision does not measure the room.` : "Key missing. Objects are not invented.",
    },
    {
      stage: "Replacement prices",
      env: pricing.id === "serpapi" ? "SERPAPI_API_KEY" : "OPENAI_API_KEY",
      ready: pricing.ready,
      provider: pricing.id === "serpapi" ? "SerpAPI Google Shopping (optional)" : "OpenAI web search",
      cost: pricing.id === "serpapi" ? "about $0.01 to $0.02 per item" : "per search, often cents per item plus tokens",
      note: pricing.reason,
    },
    {
      stage: "Storage",
      env: storage.mode === "supabase" ? "SUPABASE_URL" : null,
      ready: storage.ready,
      provider: storage.mode === "supabase" ? "Supabase" : "Local disk",
      cost: storage.mode === "supabase" ? "your Supabase project" : "$0",
      note: storage.note,
    },
  ];
}
