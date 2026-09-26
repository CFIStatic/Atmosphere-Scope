/**
 * Admit a motion clip only when the description and verb are present.
 * Adapted from Atmosphere `backend/src/shared/motionClips.ts` (commit a9e2680).
 * Unknown verbs are dropped. Privacy ranges exclude the clip entirely.
 */

export const MIN_MOTION_CONFIDENCE = 0.45;

const VERBS = new Set(["fasten", "cut", "measure", "drill", "mark", "align", "apply", "remove", "clean", "inspect"]);

const ALIASES: Record<string, string> = {
  screw: "fasten", cut: "cut", saw: "cut", measure: "measure", drill: "drill", paint: "apply", demo: "remove", clean: "clean", inspect: "inspect",
};

export type MotionClip = { verb: string; description: string; atSeconds: number; confidence: number };

export function admitMotionClip(input: {
  description: string | null;
  verb: string | null;
  confidence: number;
  atSeconds: number;
  privacyRanges?: { start: number; end: number }[];
}): MotionClip | null {
  const description = input.description?.trim() ?? "";
  if (!description) return null;
  if (!Number.isFinite(input.confidence) || input.confidence < MIN_MOTION_CONFIDENCE) return null;
  const raw = (input.verb ?? "").trim().toLowerCase();
  const verb = VERBS.has(raw) ? raw : ALIASES[raw];
  if (!verb) return null;
  const blocked = (input.privacyRanges ?? []).some((range) => input.atSeconds >= range.start && input.atSeconds <= range.end);
  if (blocked) return null;
  return { verb, description: description.slice(0, 240), atSeconds: Math.max(0, input.atSeconds), confidence: input.confidence };
}
