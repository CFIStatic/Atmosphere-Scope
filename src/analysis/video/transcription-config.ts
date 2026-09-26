/**
 * Resolve the speech endpoint.
 * Adapted from Atmosphere `backend/src/lib/transcriptionConfig.ts` (commit a9e2680).
 * Scope's default model stays gpt-4o-mini-transcribe. Atmosphere defaulted to whisper-1.
 */

export type TranscriptionConfig = { url: string; apiKey: string; model: string };

export const OPENAI_TRANSCRIPTIONS_URL = "https://api.openai.com/v1/audio/transcriptions";

function trim(value: unknown): string {
  return String(value ?? "").trim();
}

export function resolveTranscriptionConfig(env: Record<string, string | undefined> = process.env): TranscriptionConfig {
  const apiKey = trim(env.TRANSCRIPTION_API_KEY) || trim(env.OPENAI_API_KEY);
  const explicitUrl = trim(env.TRANSCRIPTION_URL);
  const base = trim(env.OPENAI_BASE_URL) || "https://api.openai.com/v1";
  const cleaned = base.replace(/\/+$/, "");
  const openaiUrl = /\/audio\/transcriptions$/i.test(cleaned) ? cleaned : `${cleaned}/audio/transcriptions`;
  const url = explicitUrl || (apiKey ? openaiUrl : "");
  const model = trim(env.TRANSCRIPTION_MODEL) || trim(env.OPENAI_TRANSCRIBE_MODEL) || "gpt-4o-mini-transcribe";
  return { url, apiKey, model };
}

export function transcriptionConfigured(cfg: TranscriptionConfig = resolveTranscriptionConfig()): boolean {
  return Boolean(cfg.url);
}
