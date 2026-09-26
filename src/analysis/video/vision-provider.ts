/**
 * Which vision provider this process can call.
 * Atmosphere (`backend/src/lib/visionProvider.ts`) preferred Gemini, then Anthropic.
 * Scope stays on OpenAI. A Gemini or Anthropic key does not switch providers.
 */

export function openaiVisionConfigured(env: Record<string, string | undefined> = process.env): boolean {
  return Boolean(env.OPENAI_API_KEY?.trim());
}

export function visionProviderLabel(env: Record<string, string | undefined> = process.env): "openai" | "unconfigured" {
  return openaiVisionConfigured(env) ? "openai" : "unconfigured";
}

export function formatVisionFailure(err: unknown): string {
  const text = err instanceof Error ? err.message : String(err);
  return text.replace(/sk-[A-Za-z0-9_-]+/g, "sk-…").replace(/\s+/g, " ").slice(0, 280);
}
