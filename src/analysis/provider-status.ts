export type ProviderRow = {
  stage: string;
  env: string | null;
  ready: boolean;
  provider: string;
  cost: string;
  note: string;
};

export function providerStatus(env: NodeJS.ProcessEnv = process.env): ProviderRow[] {
  const openai = Boolean(env.OPENAI_API_KEY);
  const serp = Boolean(env.SERPAPI_API_KEY);
  return [
    {
      stage: "Room measurement",
      env: null,
      ready: true,
      provider: "Local OpenCV ChArUco solve",
      cost: "$0",
      note: "No API key. Prints the letter sheet, detects it, calibrates, and fits planes.",
    },
    {
      stage: "Transcription",
      env: "OPENAI_API_KEY",
      ready: openai,
      provider: "OpenAI Whisper",
      cost: "about $0.006 per minute",
      note: openai ? "Key is set." : "Key missing. Narration is not invented.",
    },
    {
      stage: "Object identification",
      env: "OPENAI_API_KEY",
      ready: openai,
      provider: "OpenAI gpt-4o-mini vision",
      cost: "about $0.01 per keyframe",
      note: openai ? "Key is set." : "Key missing. Objects are not invented.",
    },
    {
      stage: "Replacement prices",
      env: "SERPAPI_API_KEY",
      ready: serp,
      provider: "SerpAPI Google Shopping",
      cost: "about $0.01 to $0.02 per item",
      note: serp ? "Key is set." : "Key missing. Prices stay blank. Nothing is invented.",
    },
  ];
}
