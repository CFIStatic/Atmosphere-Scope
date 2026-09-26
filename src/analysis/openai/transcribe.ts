import { openaiKey, redact, transcribeModel, type Env } from "@/analysis/config";
import { screenText } from "@/analysis/guard";
import { noteModelUse, type UsageAttribution } from "@/analysis/usage-log";
import { formatVerboseTranscript } from "@/analysis/video/transcription";

export type TranscriptionResult = {
  status: "ok" | "missing_key" | "failed";
  text: string | null;
  note: string;
  injectionFlags: string[];
};

export async function transcribeWithOpenAI(
  file: { filename: string; bytes: Uint8Array; mimeType: string } | null,
  options: { env?: Env; fetchImpl?: typeof fetch; jobId?: string | null; attribution?: UsageAttribution } = {},
): Promise<TranscriptionResult> {
  const env = options.env ?? process.env;
  const key = openaiKey(env);
  if (!key) {
    return { status: "missing_key", text: null, note: "OPENAI_API_KEY is not set. Narration was not invented.", injectionFlags: [] };
  }
  if (!file || file.bytes.byteLength === 0) {
    return { status: "failed", text: null, note: "No audio was available to transcribe. Narration was not invented.", injectionFlags: [] };
  }
  const fetchImpl = options.fetchImpl ?? fetch;
  try {
    const model = transcribeModel(env);
    const form = new FormData();
    form.set("model", model);
    // whisper-1 can return timed segments. gpt-4o transcribe models only accept json.
    if (/^whisper/i.test(model)) {
      form.set("response_format", "verbose_json");
      form.append("timestamp_granularities[]", "segment");
    } else {
      form.set("response_format", "json");
    }
    form.set("file", new Blob([Buffer.from(file.bytes)], { type: file.mimeType || "application/octet-stream" }), file.filename || "walkthrough.mp4");
    const response = await fetchImpl("https://api.openai.com/v1/audio/transcriptions", {
      method: "POST",
      headers: { Authorization: `Bearer ${key}` },
      body: form,
    });
    const payload = await response.json().catch(() => null);
    await noteModelUse(payload, transcribeModel(env), options.jobId, options.attribution);
    if (!response.ok) {
      return { status: "failed", text: null, note: `Transcription failed (${response.status}). Narration was not invented.`, injectionFlags: [] };
    }
    const text = transcriptText(payload);
    if (!text) {
      return { status: "failed", text: null, note: "Transcription returned no text. Narration was not invented.", injectionFlags: [] };
    }
    const injectionFlags = screenText(text).map((flag) => flag.id);
    const note = injectionFlags.length
      ? "Transcript stored as speech. Instruction-like phrases are not commands and do not set a price."
      : "Transcript stored as speech. It is not a measurement.";
    return { status: "ok", text, note, injectionFlags };
  } catch (error) {
    return { status: "failed", text: null, note: `${redact(error instanceof Error ? error.message : "Transcription failed.")} Narration was not invented.`, injectionFlags: [] };
  }
}

function transcriptText(payload: unknown): string {
  if (!payload || typeof payload !== "object") return "";
  const body = payload as { text?: unknown; segments?: unknown };
  const text = typeof body.text === "string" ? body.text.trim() : "";
  const segments = Array.isArray(body.segments)
    ? body.segments.flatMap((item) => {
        if (!item || typeof item !== "object") return [];
        const row = item as { start?: unknown; text?: unknown };
        const segmentText = typeof row.text === "string" ? row.text.trim() : "";
        if (!segmentText) return [];
        const start = typeof row.start === "number" ? row.start : Number(row.start);
        return [{ start: Number.isFinite(start) ? start : null, text: segmentText }];
      })
    : [];
  return formatVerboseTranscript({ text, segments }).trim();
}
