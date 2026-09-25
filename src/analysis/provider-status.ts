import { selectMeasurementBackend, selectPricingProvider, selectStorage, type Env } from "@/analysis/config";

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
  const visionModel = env.OPENAI_VISION_MODEL?.trim() || "gpt-4o-mini";
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
      provider: `OpenAI ${visionModel} vision`,
      cost: "typically under about $0.01 per keyframe, at most 4 keyframes",
      note: openai ? "Key is set. Names can be wrong. Vision does not measure the room." : "Key missing. Objects are not invented.",
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
