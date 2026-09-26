/**
 * Slice a long recording into transcription windows and stamp them back onto the timeline.
 * Adapted from Atmosphere `backend/src/audio/proofTranscript.ts` (commit a9e2680).
 */

import { formatVerboseTranscript, type TranscriptSegmentIn } from "./transcription";

export function transcriptWindows(durationSeconds: number, windowSeconds = 600): { start: number; end: number }[] {
  if (!Number.isFinite(durationSeconds) || durationSeconds <= 0) return [];
  const windows: { start: number; end: number }[] = [];
  for (let start = 0; start < durationSeconds; start += windowSeconds) {
    windows.push({ start, end: Math.min(durationSeconds, start + windowSeconds) });
  }
  return windows;
}

export function stitchWindowTranscripts(windows: { start: number; body: { text?: string | null; segments?: TranscriptSegmentIn[] | null } }[]): string {
  return windows.map((window) => formatVerboseTranscript(window.body, window.start)).filter(Boolean).join("\n");
}
