import { openaiKey, redact, transcribeModel, type Env } from "@/analysis/config";
import { screenText } from "@/analysis/guard";

export type TranscriptionResult = {
  status: "ok" | "missing_key" | "failed";
  text: string | null;
  note: string;
  injectionFlags: string[];
};

export async function transcribeWithOpenAI(
  file: { filename: string; bytes: Uint8Array; mimeType: string } | null,
  options: { env?: Env; fetchImpl?: typeof fetch } = {},
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
    const form = new FormData();
    form.set("model", transcribeModel(env));
    form.set("response_format", "json");
    form.set("file", new Blob([Buffer.from(file.bytes)], { type: file.mimeType || "application/octet-stream" }), file.filename || "walkthrough.mp4");
    const response = await fetchImpl("https://api.openai.com/v1/audio/transcriptions", {
      method: "POST",
      headers: { Authorization: `Bearer ${key}` },
      body: form,
    });
    const payload = await response.json().catch(() => null);
    if (!response.ok) {
      return { status: "failed", text: null, note: `Transcription failed (${response.status}). Narration was not invented.`, injectionFlags: [] };
    }
    const text = payload && typeof payload === "object" && typeof (payload as { text?: unknown }).text === "string"
      ? (payload as { text: string }).text.trim()
      : "";
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
