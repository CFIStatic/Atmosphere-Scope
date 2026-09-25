export type Env = Record<string, string | undefined>;

export type PricingProviderId = "openai" | "serpapi";

export type PricingSelection = {
  id: PricingProviderId;
  ready: boolean;
  reason: string;
};

export type MeasurementSelection = {
  requested: string;
  used: "local";
  note: string;
};

export type StorageSelection = {
  mode: "local" | "supabase";
  ready: boolean;
  note: string;
};

function trimmed(env: Env, name: string): string {
  return env[name]?.trim() ?? "";
}

/** Default is OpenAI web search. A SerpAPI key alone does not switch providers. */
export function selectPricingProvider(env: Env = process.env): PricingSelection {
  const requested = trimmed(env, "PRICING_PROVIDER").toLowerCase();
  const serpIgnored = trimmed(env, "SERPAPI_API_KEY") ? " SERPAPI_API_KEY is set and ignored." : "";
  if (requested === "serpapi") {
    if (!trimmed(env, "SERPAPI_API_KEY")) {
      return {
        id: "serpapi",
        ready: false,
        reason: "PRICING_PROVIDER=serpapi but SERPAPI_API_KEY is not set. No price was invented.",
      };
    }
    return {
      id: "serpapi",
      ready: true,
      reason: "SerpAPI was selected explicitly. Each price is still checked on the product page when the fetch succeeds.",
    };
  }
  if (requested && requested !== "openai") {
    return {
      id: "openai",
      ready: false,
      reason: `Unknown PRICING_PROVIDER=${requested}. Prices stay blank. Nothing was invented.`,
    };
  }
  if (!trimmed(env, "OPENAI_API_KEY")) {
    return {
      id: "openai",
      ready: false,
      reason: `OPENAI_API_KEY is not set. Prices stay blank. Nothing was invented.${serpIgnored}`,
    };
  }
  return {
    id: "openai",
    ready: true,
    reason: `OpenAI web search. Each returned price is checked on the product page when the fetch succeeds. Unverified prices stay marked.${serpIgnored}`,
  };
}

/** Hosted GPU backends are optional. Measurement always stays on local OpenCV in this build. */
export function selectMeasurementBackend(env: Env = process.env): MeasurementSelection {
  const requested = trimmed(env, "MEASUREMENT_BACKEND").toLowerCase();
  if (!requested || requested === "local" || requested === "opencv") {
    return { requested: "local", used: "local", note: "Local OpenCV on this server. No hosted GPU." };
  }
  if (requested === "replicate") {
    if (!trimmed(env, "REPLICATE_API_TOKEN")) {
      return {
        requested: "replicate",
        used: "local",
        note: "MEASUREMENT_BACKEND=replicate but REPLICATE_API_TOKEN is missing. Local OpenCV ran. No GPU model was called.",
      };
    }
    if (!trimmed(env, "REPLICATE_MODEL")) {
      return {
        requested: "replicate",
        used: "local",
        note: "REPLICATE_API_TOKEN is set but REPLICATE_MODEL is unset. No default GPU model is configured. Local OpenCV ran.",
      };
    }
    return {
      requested: "replicate",
      used: "local",
      note: `Replicate model ${trimmed(env, "REPLICATE_MODEL")} is configured as an optional adapter. This build does not call it. Local OpenCV produced the measurement.`,
    };
  }
  if (requested === "modal") {
    if (!trimmed(env, "MODAL_TOKEN_ID") || !trimmed(env, "MODAL_TOKEN_SECRET")) {
      return {
        requested: "modal",
        used: "local",
        note: "MEASUREMENT_BACKEND=modal but Modal tokens are missing. Local OpenCV ran. No GPU model was called.",
      };
    }
    return {
      requested: "modal",
      used: "local",
      note: "Modal is configured as an optional adapter. This build does not call it. Local OpenCV produced the measurement.",
    };
  }
  return {
    requested,
    used: "local",
    note: `Unknown MEASUREMENT_BACKEND=${requested}. Local OpenCV ran.`,
  };
}

/** Local disk is the default. Supabase is used only when STORAGE=supabase. */
export function selectStorage(env: Env = process.env): StorageSelection {
  const requested = (trimmed(env, "STORAGE") || "local").toLowerCase();
  if (requested === "supabase") {
    if (!trimmed(env, "SUPABASE_URL") || !supabaseKey(env)) {
      return {
        mode: "supabase",
        ready: false,
        note: "STORAGE=supabase requires SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY (or SUPABASE_SECRET_KEY). Local disk is not used as a silent fallback.",
      };
    }
    return { mode: "supabase", ready: true, note: "Jobs and media use Supabase. The secret key stays on the server." };
  }
  if (requested !== "local") {
    return {
      mode: "local",
      ready: true,
      note: `Unknown STORAGE=${requested}. Using local disk in data/.`,
    };
  }
  return { mode: "local", ready: true, note: "JSON files in data/jobs and files in data/media. No extra key." };
}

export function assertStorageReady(env: Env = process.env): StorageSelection {
  const selected = selectStorage(env);
  if (selected.mode === "supabase" && !selected.ready) throw new Error(selected.note);
  return selected;
}

export function supabaseKey(env: Env = process.env): string {
  return trimmed(env, "SUPABASE_SERVICE_ROLE_KEY") || trimmed(env, "SUPABASE_SECRET_KEY");
}

export function openaiKey(env: Env = process.env): string {
  return trimmed(env, "OPENAI_API_KEY");
}

export function transcribeModel(env: Env = process.env): string {
  return trimmed(env, "OPENAI_TRANSCRIBE_MODEL") || "gpt-4o-mini-transcribe";
}

export function visionModel(env: Env = process.env): string {
  return trimmed(env, "OPENAI_VISION_MODEL") || "gpt-4o-mini";
}

export function pricingModel(env: Env = process.env): string {
  return trimmed(env, "OPENAI_PRICING_MODEL") || "gpt-4o-mini";
}

export function webSearchTool(env: Env = process.env): string {
  return trimmed(env, "OPENAI_WEB_SEARCH_TOOL") || "web_search";
}

export function redact(message: string): string {
  return message
    .replace(/sk-[A-Za-z0-9_-]+/g, "sk-…")
    .replace(/Bearer\s+\S+/gi, "Bearer …")
    .replace(/api_key=[^&\s]+/gi, "api_key=…")
    .slice(0, 300);
}
