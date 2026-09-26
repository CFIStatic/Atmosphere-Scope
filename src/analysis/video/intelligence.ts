/**
 * Prepare frames, then plan crops.
 * Adapted from Atmosphere `backend/src/shared/videoIntelligence.ts` (commit a9e2680).
 * Dictation stays on OpenAI in `src/analysis/openai/inventory.ts`. This module
 * only chooses which stills are worth sending.
 */

import { selectDiverseFrames, type DiverseFrame } from "./frame-diversity";
import { planTiles } from "@/analysis/objects/tiles";
import type { TileRef } from "@/analysis/objects/detect";

export function isLongFormVideo(durationSeconds: number, longFormSeconds = 20 * 60): boolean {
  return durationSeconds >= longFormSeconds;
}

export function prepareFrames(candidates: { atSeconds: number; jpeg: Buffer }[], opts?: { maxFrames?: number; durationSeconds?: number }): DiverseFrame[] {
  const long = isLongFormVideo(opts?.durationSeconds ?? 0);
  const maxFrames = opts?.maxFrames ?? (long ? 48 : 120);
  return selectDiverseFrames(candidates, { maxFrames, hammingThreshold: 8, coverageIntervalSeconds: long ? 3600 : 30 });
}

export function framesToRead(frames: DiverseFrame[]): { frame: DiverseFrame; tiles: TileRef[] }[] {
  const tiles = planTiles(2, 2);
  return frames.map((frame) => ({ frame, tiles }));
}
