/**
 * Stamp a Whisper-family transcript so a quote can be seeked.
 * Adapted from Atmosphere `backend/src/lib/transcription.ts` (commit a9e2680).
 * The HTTP call stays in `src/analysis/openai/transcribe.ts` (OpenAI only).
 */

export type TranscriptSegmentIn = { start?: number | null; text?: string | null };

export function stampClock(seconds: number): string {
  const s = Math.max(0, Math.round(seconds));
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  const r = s % 60;
  if (h > 0) return `${h}:${String(m).padStart(2, "0")}:${String(r).padStart(2, "0")}`;
  return `${m}:${String(r).padStart(2, "0")}`;
}

export function transcriptAlreadyStamped(text: string): boolean {
  return /^\s*\[(?:\d+:)+\d+\]/.test(text);
}

export function formatVerboseTranscript(body: { text?: string | null; segments?: TranscriptSegmentIn[] | null }, timeOffsetSeconds = 0): string {
  const offset = Number.isFinite(timeOffsetSeconds) ? Math.max(0, timeOffsetSeconds) : 0;
  const segments = Array.isArray(body.segments) ? body.segments : [];
  const stamped = segments.map((segment) => {
    const text = String(segment?.text || "").trim();
    if (!text) return "";
    const start = Number(segment?.start);
    const at = offset + (Number.isFinite(start) && start >= 0 ? start : 0);
    return `[${stampClock(at)}] ${text}`;
  }).filter(Boolean);
  if (stamped.length) return stamped.join("\n");
  return String(body.text || "").trim();
}

export function filenameForMime(mimeType: string): string {
  const base = mimeType.split(";")[0]?.trim().toLowerCase();
  switch (base) {
    case "audio/webm": return "audio.webm";
    case "audio/ogg": return "audio.ogg";
    case "audio/mp4":
    case "audio/x-m4a": return "audio.m4a";
    case "audio/mpeg": return "audio.mp3";
    case "audio/wav":
    case "audio/x-wav": return "audio.wav";
    default: return "audio.webm";
  }
}
