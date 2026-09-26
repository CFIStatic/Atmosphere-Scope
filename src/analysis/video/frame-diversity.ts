/**
 * Keep frames that show different things.
 * Adapted from Atmosphere `backend/src/shared/frameDiversity.ts` (commit a9e2680).
 * A static camera must not spend a vision call on the same picture.
 */

import { createHash } from "node:crypto";

export type LuminanceSampler = (bytes: Buffer) => { width: number; height: number; pixels: Uint8Array };

export const heuristicLuminanceSampler: LuminanceSampler = (bytes) => {
  const sample = bytes.length > 200_000 ? bytes.subarray(0, 200_000) : bytes;
  const side = Math.max(8, Math.floor(Math.sqrt(sample.length / 3)));
  const pixels = new Uint8Array(side * side);
  for (let i = 0; i < pixels.length; i += 1) {
    const idx = Math.min(sample.length - 1, i * 3);
    pixels[i] = sample[idx] ?? 0;
  }
  return { width: side, height: side, pixels };
};

export function perceptualHash(width: number, height: number, pixels: Uint8Array): string {
  const size = 8;
  const blockW = Math.max(1, Math.floor(width / size));
  const blockH = Math.max(1, Math.floor(height / size));
  const vals: number[] = [];
  for (let by = 0; by < size; by += 1) {
    for (let bx = 0; bx < size; bx += 1) {
      let sum = 0;
      let count = 0;
      for (let y = by * blockH; y < (by + 1) * blockH && y < height; y += 1) {
        for (let x = bx * blockW; x < (bx + 1) * blockW && x < width; x += 1) {
          sum += pixels[y * width + x] ?? 0;
          count += 1;
        }
      }
      vals.push(count ? sum / count : 0);
    }
  }
  const avg = vals.reduce((a, b) => a + b, 0) / (vals.length || 1);
  let bits = "";
  for (const value of vals) bits += value >= avg ? "1" : "0";
  let hex = "";
  for (let i = 0; i < 64; i += 4) hex += parseInt(bits.slice(i, i + 4), 2).toString(16);
  return hex;
}

export function hammingDistanceHex(a: string, b: string): number {
  if (a.length !== b.length) return 64;
  let dist = 0;
  for (let i = 0; i < a.length; i += 1) {
    const x = parseInt(a[i] ?? "0", 16) ^ parseInt(b[i] ?? "0", 16);
    dist += (x & 1) + ((x >> 1) & 1) + ((x >> 2) & 1) + ((x >> 3) & 1);
  }
  return dist;
}

export function contentFingerprint(bytes: Buffer): string {
  return createHash("sha256").update(bytes).digest("hex").slice(0, 16);
}

export type DiverseCandidate = { atSeconds: number; jpeg: Buffer };
export type DiverseFrame = DiverseCandidate & { perceptualHash: string; contentHash: string; reason: "first" | "changed" | "coverage" };

export function selectDiverseFrames(candidates: DiverseCandidate[], opts: { maxFrames: number; hammingThreshold?: number; coverageIntervalSeconds?: number; sampler?: LuminanceSampler }): DiverseFrame[] {
  const maxFrames = Math.max(1, Math.floor(opts.maxFrames));
  const threshold = opts.hammingThreshold ?? 8;
  const coverageEvery = Math.max(60, opts.coverageIntervalSeconds ?? 3600);
  const sampler = opts.sampler ?? heuristicLuminanceSampler;
  const scored = candidates.map((candidate) => {
    const { width, height, pixels } = sampler(candidate.jpeg);
    return { atSeconds: candidate.atSeconds, jpeg: candidate.jpeg, perceptualHash: perceptualHash(width, height, pixels), contentHash: contentFingerprint(candidate.jpeg) };
  }).sort((a, b) => a.atSeconds - b.atSeconds);

  const kept: DiverseFrame[] = [];
  const seenContent = new Set<string>();
  let lastCoverageAt = -Infinity;
  for (const frame of scored) {
    const isFirst = kept.length === 0;
    const needsCoverage = frame.atSeconds - lastCoverageAt >= coverageEvery;
    const exactDup = seenContent.has(frame.contentHash);
    if (exactDup && !isFirst && !needsCoverage) continue;
    const differs = !exactDup && kept.every((item) => hammingDistanceHex(item.perceptualHash, frame.perceptualHash) > threshold);
    if (isFirst) {
      kept.push({ ...frame, reason: "first" });
      seenContent.add(frame.contentHash);
      lastCoverageAt = frame.atSeconds;
      continue;
    }
    if (differs) {
      kept.push({ ...frame, reason: "changed" });
      seenContent.add(frame.contentHash);
      lastCoverageAt = frame.atSeconds;
      continue;
    }
    if (needsCoverage) {
      kept.push({ ...frame, reason: "coverage" });
      seenContent.add(frame.contentHash);
      lastCoverageAt = frame.atSeconds;
    }
  }
  if (kept.length <= maxFrames) return kept;
  const changes = kept.filter((item) => item.reason !== "coverage");
  if (changes.length >= maxFrames) {
    const step = changes.length / maxFrames;
    const out: DiverseFrame[] = [];
    for (let i = 0; i < maxFrames; i += 1) out.push(changes[Math.min(changes.length - 1, Math.floor(i * step))]!);
    return dedupeByTime(out);
  }
  const remaining = maxFrames - changes.length;
  const coverage = kept.filter((item) => item.reason === "coverage");
  const step = coverage.length / remaining;
  const picked: DiverseFrame[] = [];
  for (let i = 0; i < remaining && coverage.length; i += 1) picked.push(coverage[Math.min(coverage.length - 1, Math.floor(i * step))]!);
  return dedupeByTime([...changes, ...picked]).sort((a, b) => a.atSeconds - b.atSeconds);
}

function dedupeByTime(frames: DiverseFrame[]): DiverseFrame[] {
  const seen = new Set<number>();
  const out: DiverseFrame[] = [];
  for (const frame of frames) {
    const key = Math.round(frame.atSeconds * 100);
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(frame);
  }
  return out;
}
