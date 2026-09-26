/**
 * Seekable evidence rows. Near-duplicate text at the same second is dropped.
 * Adapted from Atmosphere `backend/src/audio/evidenceLog.ts` (commit a9e2680).
 * The safety ceiling is not an object cap.
 */

export const MAX_EVIDENCE_LOG_ENTRIES = 2_000;

export type EvidenceLogEntry = {
  atSeconds: number;
  text: string;
  type: string;
  quote?: string | null;
  confidence?: number | null;
  kind?: string | null;
};

function roundTime(seconds: number): number {
  return Math.round(Math.max(0, seconds) * 100) / 100;
}

function normalizeKey(text: string): string {
  return text.toLowerCase().replace(/[^\w\s]/g, " ").replace(/\s+/g, " ").trim();
}

function isNearDuplicate(a: EvidenceLogEntry, b: EvidenceLogEntry): boolean {
  if (Math.abs(a.atSeconds - b.atSeconds) > 1.5) return false;
  if ((a.type || "") !== (b.type || "")) return false;
  const left = normalizeKey(a.text);
  const right = normalizeKey(b.text);
  if (!left || !right) return false;
  if (left === right) return true;
  if (left.length >= 24 && right.includes(left.slice(0, 24))) return true;
  if (right.length >= 24 && left.includes(right.slice(0, 24))) return true;
  return false;
}

export function dedupeEvidenceLog(entries: EvidenceLogEntry[]): EvidenceLogEntry[] {
  const sorted = [...entries].sort((a, b) => a.atSeconds - b.atSeconds || a.text.localeCompare(b.text));
  const out: EvidenceLogEntry[] = [];
  for (const entry of sorted) {
    if (out.some((prev) => isNearDuplicate(prev, entry))) continue;
    out.push({ ...entry, atSeconds: roundTime(entry.atSeconds) });
    if (out.length >= MAX_EVIDENCE_LOG_ENTRIES) break;
  }
  return out;
}

export function evidenceFromTranscript(transcript: string): EvidenceLogEntry[] {
  const lines = transcript.split(/\n+/).map((line) => line.trim()).filter(Boolean);
  return dedupeEvidenceLog(lines.map((line, index) => ({ atSeconds: index, text: line.slice(0, 500), type: "said", quote: line })));
}
