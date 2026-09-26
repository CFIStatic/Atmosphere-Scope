/**
 * Token and dollar log for one walkthrough.
 * Rates are OpenAI list rates used for planning. They are not an invoice.
 * Inventory default gpt-6-astra: $10 / 1M input, $50 / 1M output.
 * Keyframe triage gpt-4o-mini: $0.15 / 1M input, $0.60 / 1M output.
 * gpt-4o-mini-transcribe: $0.003 per minute.
 */

import type { AnalysisCostLog, AnalysisEscalationCounts, AnalysisStageCost } from "@/domain/types";
import { listCostUsd } from "@/domain/workspace";
import type { AnalysisMode } from "@/analysis/config";

export const INVENTORY_MODEL = "gpt-6-astra";
export const TRIAGE_MODEL = "gpt-4o-mini";
export const TRANSCRIBE_USD_PER_MINUTE = 0.003;

export function tokensToUsd(inputTokens: number, outputTokens: number, model = INVENTORY_MODEL): number {
  const input = Number.isFinite(inputTokens) ? Math.max(0, inputTokens) : 0;
  const output = Number.isFinite(outputTokens) ? Math.max(0, outputTokens) : 0;
  return listCostUsd(model, input, output) ?? 0;
}

export function stageCost(stage: string, model: string, inputTokens: number, outputTokens: number, latencyMs: number): AnalysisStageCost {
  return {
    stage,
    model,
    inputTokens: Math.max(0, Math.round(inputTokens) || 0),
    outputTokens: Math.max(0, Math.round(outputTokens) || 0),
    latencyMs: Math.max(0, Math.round(latencyMs) || 0),
    estimatedUsd: tokensToUsd(inputTokens, outputTokens, model),
  };
}

export function costLog(input: { mediaId?: string | null; durationSeconds?: number | null; stages: AnalysisStageCost[]; note: string; escalation?: AnalysisEscalationCounts | null }): AnalysisCostLog {
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
    escalation: input.escalation ?? null,
  };
}

/**
 * Planning allowance for one minute. These are list-rate estimates, not invoices.
 * 12 distinct frames. Triage and strong mode each send the full frame plus a 2×2 grid,
 * budgeted at 4,800 input and 1,600 output tokens per frame.
 * Cascade adds about 8 strong-model object crops at 1,200 input and 400 output each.
 * Transcription is $0.003 per minute on top.
 */
export const PLANNING_FRAMES = 12;
export const PLANNING_INPUT_PER_FRAME = 4800;
export const PLANNING_OUTPUT_PER_FRAME = 1600;
export const PLANNING_ESCALATED_CROPS = 8;
export const PLANNING_CROP_INPUT = 1200;
export const PLANNING_CROP_OUTPUT = 400;

export function expectedModeMinuteUsd(mode: AnalysisMode, opts?: { distinctFrames?: number; escalatedCrops?: number }): {
  mode: AnalysisMode;
  visionUsd: number;
  transcribeUsd: number;
  totalUsd: number;
  distinctFrames: number;
  escalatedCrops: number;
  triageModel: string | null;
  visionModel: string | null;
} {
  const distinctFrames = opts?.distinctFrames ?? PLANNING_FRAMES;
  const escalatedCrops = mode === "cascade" ? opts?.escalatedCrops ?? PLANNING_ESCALATED_CROPS : 0;
  const triageTokens = mode === "strong" ? { input: 0, output: 0 } : { input: distinctFrames * PLANNING_INPUT_PER_FRAME, output: distinctFrames * PLANNING_OUTPUT_PER_FRAME };
  const strongTokens = mode === "cheap"
    ? { input: 0, output: 0 }
    : mode === "strong"
      ? { input: distinctFrames * PLANNING_INPUT_PER_FRAME, output: distinctFrames * PLANNING_OUTPUT_PER_FRAME }
      : { input: escalatedCrops * PLANNING_CROP_INPUT, output: escalatedCrops * PLANNING_CROP_OUTPUT };
  const triageModel = mode === "strong" ? null : TRIAGE_MODEL;
  const visionModel = mode === "cheap" ? null : INVENTORY_MODEL;
  const visionUsd = round6(
    (triageModel ? tokensToUsd(triageTokens.input, triageTokens.output, triageModel) : 0)
    + (visionModel ? tokensToUsd(strongTokens.input, strongTokens.output, visionModel) : 0),
  );
  const transcribeUsd = TRANSCRIBE_USD_PER_MINUTE;
  return { mode, visionUsd, transcribeUsd, totalUsd: round6(visionUsd + transcribeUsd), distinctFrames, escalatedCrops, triageModel, visionModel };
}

/**
 * Planning cost for one minute of a moving interior walk.
 * 12 distinct frames after the diversity filter. Each frame is a full image plus a
 * 2×2 crop grid (five vision requests). The token counts below are a planning
 * allowance for that set, about 4,800 input and 1,600 output per distinct frame,
 * plus transcription. Live usage is whatever the provider returns, including
 * reasoning tokens billed as output.
 * A static camera keeps fewer frames, so this is the high side of a normal minute.
 */
export function expectedWalkthroughMinuteUsd(opts?: { distinctFrames?: number; inputTokensPerFrame?: number; outputTokensPerFrame?: number; model?: string }): { visionUsd: number; transcribeUsd: number; totalUsd: number; distinctFrames: number; model: string } {
  const distinctFrames = opts?.distinctFrames ?? PLANNING_FRAMES;
  const inputTokens = opts?.inputTokensPerFrame ?? PLANNING_INPUT_PER_FRAME;
  const outputTokens = opts?.outputTokensPerFrame ?? PLANNING_OUTPUT_PER_FRAME;
  const model = opts?.model ?? INVENTORY_MODEL;
  const visionUsd = tokensToUsd(distinctFrames * inputTokens, distinctFrames * outputTokens, model);
  const transcribeUsd = TRANSCRIBE_USD_PER_MINUTE;
  return { visionUsd, transcribeUsd, totalUsd: round6(visionUsd + transcribeUsd), distinctFrames, model };
}

export function usageFromChat(body: unknown, latencyMs: number, model: string, stage: string): AnalysisStageCost {
  const usage = body && typeof body === "object" ? (body as { usage?: { prompt_tokens?: number; completion_tokens?: number } }).usage : undefined;
  return stageCost(stage, model, usage?.prompt_tokens ?? 0, usage?.completion_tokens ?? 0, latencyMs);
}

function round6(value: number): number {
  return Math.round(value * 1_000_000) / 1_000_000;
}
