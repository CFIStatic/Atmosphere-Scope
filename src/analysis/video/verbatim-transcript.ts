/**
 * Segment a filed transcript for seek and search. Never paraphrases.
 * Adapted from Atmosphere `backend/src/audio/verbatimTranscript.ts` (commit a9e2680).
 */

export type VerbatimSegment = { tSec: number | null; text: string; speakerLabel?: string | null };

const SPEAKER_LEAD = /^(homeowner|owner|home owner|contractor|crew|tech|technician|worker|adjuster|inspector|speaker\s*[a-d]|person\s*[12])\s*[:\-–—]\s*/i;

function clockToSeconds(raw: string): number | null {
  const parts = raw.split(":").map((part) => Number(part));
  if (parts.some((n) => !Number.isFinite(n))) return null;
  if (parts.length === 3) return parts[0]! * 3600 + parts[1]! * 60 + parts[2]!;
  if (parts.length === 2) return parts[0]! * 60 + parts[1]!;
  if (parts.length === 1) return parts[0]!;
  return null;
}

function normalizeSpeaker(raw: string): string | null {
  const s = raw.trim().toLowerCase().replace(/\s+/g, " ");
  if (!s) return null;
  if (/^home\s*owner|^owner$/.test(s)) return "Homeowner";
  if (/^contractor|^crew|^tech|^technician|^worker/.test(s)) return "Crew";
  if (/^adjuster/.test(s)) return "Adjuster";
  if (/^inspector/.test(s)) return "Inspector";
  return raw.trim().slice(0, 24) || null;
}

export function parseVerbatimTranscript(transcript: string | null | undefined): VerbatimSegment[] {
  const src = String(transcript || "").trim();
  if (!src) return [];
  const re = /\[((?:\d+:)+\d+)\]/g;
  const stamps: Array<{ at: number; index: number; end: number }> = [];
  let match: RegExpExecArray | null;
  while ((match = re.exec(src))) {
    const at = clockToSeconds(match[1] ?? "");
    if (at == null || at < 0) continue;
    stamps.push({ at, index: match.index, end: match.index + match[0].length });
  }
  const chunks: Array<{ at: number | null; text: string }> = [];
  if (!stamps.length) chunks.push({ at: null, text: src });
  else {
    for (let i = 0; i < stamps.length; i += 1) {
      const stamp = stamps[i]!;
      const next = stamps[i + 1];
      const body = src.slice(stamp.end, next ? next.index : src.length).replace(/^[\s:,.\-–—]+/, "").trim();
      if (body) chunks.push({ at: stamp.at, text: body });
    }
  }
  return chunks.map((chunk) => {
    const speaker = chunk.text.match(SPEAKER_LEAD);
    const text = speaker ? chunk.text.slice(speaker[0].length).trim() : chunk.text;
    return { tSec: chunk.at, text, speakerLabel: speaker ? normalizeSpeaker(speaker[1] ?? "") : null };
  }).filter((segment) => segment.text);
}
