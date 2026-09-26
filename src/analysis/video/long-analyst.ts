/**
 * Group a long recording into read-windows.
 * Adapted from Atmosphere `backend/src/shared/longAnalyst.ts` (commit a9e2680).
 * A line the model cites without a sighting is dropped. Coverage is counted, not composed.
 */

export type FrameRef = { atSeconds: number };
export type Window = { idx: number; startSeconds: number; endSeconds: number; frameIdxs: number[] };

export function segmentFrames(frames: FrameRef[], opts?: { maxFrames?: number; maxSeconds?: number }): Window[] {
  const maxFrames = opts?.maxFrames ?? 12;
  const maxSeconds = opts?.maxSeconds ?? 1200;
  const sorted = frames.map((frame, index) => ({ at: frame.atSeconds, index })).sort((a, b) => a.at - b.at);
  const windows: Window[] = [];
  let start = 0;
  let lastAt = 0;
  let idxs: number[] = [];
  const flush = () => {
    if (idxs.length) windows.push({ idx: windows.length, startSeconds: start, endSeconds: lastAt, frameIdxs: idxs });
    idxs = [];
  };
  for (const frame of sorted) {
    if (idxs.length && (idxs.length >= maxFrames || frame.at - start > maxSeconds)) flush();
    if (!idxs.length) start = frame.at;
    idxs.push(frame.index);
    lastAt = frame.at;
  }
  flush();
  return windows;
}

export type WindowReading = { scopeTouched: number[]; couldNotTell: string[] };

/** A verdict cannot be stronger than the windows that actually saw the line. */
export function downgradeUnseen(claimed: number[], readings: WindowReading[]): number[] {
  const seen = new Set(readings.flatMap((reading) => reading.scopeTouched));
  return claimed.filter((index) => seen.has(index));
}

export function coverageOf(lineIndex: number, windows: Window[], readings: WindowReading[]): { seen: number; total: number } {
  const total = windows.length;
  const seen = readings.filter((reading) => reading.scopeTouched.includes(lineIndex)).length;
  return { seen, total };
}
