/**
 * Fuse a vision note with a verbatim quote.
 * Adapted from Atmosphere `backend/src/audio/evidenceFusion.ts` (commit a9e2680).
 * Scope does this in code: a quote must be an exact substring, and a missing
 * modality returns the log unchanged. No second model call.
 */

import { dedupeEvidenceLog, type EvidenceLogEntry } from "./evidence-log";

export function parseFusionEntries(text: string): EvidenceLogEntry[] {
  const start = text.indexOf("{");
  const end = text.lastIndexOf("}");
  if (start < 0 || end <= start) return [];
  try {
    const data = JSON.parse(text.slice(start, end + 1)) as { entries?: unknown };
    if (!Array.isArray(data.entries)) return [];
    const out: EvidenceLogEntry[] = [];
    for (const raw of data.entries) {
      if (!raw || typeof raw !== "object") continue;
      const row = raw as Record<string, unknown>;
      const body = String(row.text ?? "").replace(/\s+/g, " ").trim();
      if (!body) continue;
      const at = Number(row.atSeconds);
      out.push({
        atSeconds: Number.isFinite(at) ? Math.round(Math.max(0, at) * 100) / 100 : 0,
        text: body.slice(0, 500),
        type: String(row.type || "other").toLowerCase(),
        quote: row.quote != null ? String(row.quote).slice(0, 500) : null,
        confidence: row.confidence != null && Number.isFinite(Number(row.confidence)) ? Number(row.confidence) : null,
        kind: "fusion",
      });
    }
    return out;
  } catch {
    return [];
  }
}

export function fuseEvidence(input: { entries: EvidenceLogEntry[]; transcript: string | null; narration: string | null }): EvidenceLogEntry[] {
  const transcript = String(input.transcript || "").trim();
  const narration = String(input.narration || "").trim();
  if (!transcript || !narration) return input.entries;
  const sentence = transcript.split(/\n+/).map((line) => line.trim()).find((line) => line && narration.toLowerCase().includes(line.replace(/^\[[^\]]+\]\s*/, "").toLowerCase().slice(0, 24)));
  if (!sentence) return input.entries;
  const quote = sentence.replace(/^\[[^\]]+\]\s*/, "");
  if (!transcript.includes(quote)) return input.entries;
  return dedupeEvidenceLog([...input.entries, { atSeconds: 0, text: `Narration grounded in speech: ${quote}`, type: "said", quote, kind: "fusion", confidence: 0.7 }]);
}
