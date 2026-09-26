/**
 * Token and dollar log for one walkthrough.
 * Rates are OpenAI list rates used for planning. They are not an invoice.
 * gpt-4o-mini: $0.15 / 1M input, $0.60 / 1M output.
 * gpt-4o-mini-transcribe: $0.003 per minute (a few tenths of a cent).
 */

import type { AnalysisCostLog, AnalysisStageCost } from "@/domain/types";

export const MINI_INPUT_USD_PER_TOKEN = 0.15 / 1_000_000;
export const MINI_OUTPUT_USD_PER_TOKEN = 0.60 / 1_000_000;
export const TRANSCRIBE_USD_PER_MINUTE = 0.003;

export function tokensToUsd(inputTokens: number, outputTokens: number): number {
  const input = Number.isFinite(inputTokens) ? Math.max(0, inputTokens) : 0;
  const output = Number.isFinite(outputTokens) ? Math.max(0, outputTokens) : 0;
  return round6(input * MINI_INPUT_USD_PER_TOKEN + output * MINI_OUTPUT_USD_PER_TOKEN);
}

export function stageCost(stage: string, model: string, inputTokens: number, outputTokens: number, latencyMs: number): AnalysisStageCost {
  return {
    stage,
    model,
    inputTokens: Math.max(0, Math.round(inputTokens) || 0),
    outputTokens: Math.max(0, Math.round(outputTokens) || 0),
    latencyMs: Math.max(0, Math.round(latencyMs) || 0),
    estimatedUsd: tokensToUsd(inputTokens, outputTokens),
  };
}

export function costLog(input: { mediaId?: string | null; durationSeconds?: number | null; stages: AnalysisStageCost[]; note: string }): AnalysisCostLog {
  const transcribe = input.durationSeconds && input.durationSeconds > 0
    ? stageCost("transcribe", "gpt-4o-mini-transcribe", 0, 0, 0)
    : null;
  if (transcribe && input.durationSeconds) transcribe.estimatedUsd = round6((input.durationSeconds / 60) * TRANSCRIBE_USD_PER_MINUTE);
  const stages = transcribe && !input.stages.some((stage) => stage.stage === "transcribe") ? [transcribe, ...input.stages] : input.stages;
  return {
    walkthroughMediaId: input.mediaId ?? null,
    durationSeconds: input.durationSeconds ?? null,
    stages,
    totalEstimatedUsd: round6(stages.reduce((sum, stage) => sum + stage.estimatedUsd, 0)),
    note: input.note,
  };
}

/**
 * Planning cost for one minute of a moving interior walk.
 * 12 distinct frames after the diversity filter. Each frame is a full image plus a
 * 2×2 crop grid (five vision requests). The token counts below are a planning
 * allowance for that set, about 4,800 input and 1,600 output per distinct frame,
 * plus transcription. Live usage is whatever the provider returns.
 * A static camera keeps fewer frames, so this is the high side of a normal minute.
 */
export function expectedWalkthroughMinuteUsd(opts?: { distinctFrames?: number; inputTokensPerFrame?: number; outputTokensPerFrame?: number }): { visionUsd: number; transcribeUsd: number; totalUsd: number; distinctFrames: number } {
  const distinctFrames = opts?.distinctFrames ?? 12;
  const inputTokens = opts?.inputTokensPerFrame ?? 4800;
  const outputTokens = opts?.outputTokensPerFrame ?? 1600;
  const visionUsd = tokensToUsd(distinctFrames * inputTokens, distinctFrames * outputTokens);
  const transcribeUsd = TRANSCRIBE_USD_PER_MINUTE;
  return { visionUsd, transcribeUsd, totalUsd: round6(visionUsd + transcribeUsd), distinctFrames };
}

export function usageFromChat(body: unknown, latencyMs: number, model: string, stage: string): AnalysisStageCost {
  const usage = body && typeof body === "object" ? (body as { usage?: { prompt_tokens?: number; completion_tokens?: number } }).usage : undefined;
  return stageCost(stage, model, usage?.prompt_tokens ?? 0, usage?.completion_tokens ?? 0, latencyMs);
}

function round6(value: number): number {
  return Math.round(value * 1_000_000) / 1_000_000;
}
