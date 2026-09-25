export const MAX_VISION_FRAMES = 4;

export type EvidenceLink = {
  frame: string;
  timeMs: number | null;
};

export type IdentifiedObject = {
  name: string;
  room: string | null;
  evidence: string;
  confidence: "low" | "medium" | "high";
  frames: string[];
  links?: EvidenceLink[];
};

/** Sample time for frame_00.jpg at the capture rate of 2 fps. */
export function frameTimeMs(name: string): number | null {
  const match = name.match(/frame_(\d+)/i);
  if (!match) return null;
  return Number(match[1]) * 500;
}

export function selectKeyframes<T extends { name: string; timeMs?: number | null }>(frames: T[], max = MAX_VISION_FRAMES): T[] {
  const ordered = [...frames].sort((a, b) => timeOf(a) - timeOf(b));
  const spaced: T[] = [];
  let last = Number.NEGATIVE_INFINITY;
  for (const frame of ordered) {
    const time = frame.timeMs ?? frameTimeMs(frame.name);
    if (time == null || time - last >= 400) {
      spaced.push(frame);
      if (time != null) last = time;
    }
  }
  if (spaced.length <= max) return spaced;
  const picked: T[] = [];
  for (let index = 0; index < max; index += 1) picked.push(spaced[Math.round((index * (spaced.length - 1)) / (max - 1))]);
  return [...new Set(picked)];
}

function timeOf(frame: { name: string; timeMs?: number | null }): number {
  return frame.timeMs ?? frameTimeMs(frame.name) ?? 0;
}
