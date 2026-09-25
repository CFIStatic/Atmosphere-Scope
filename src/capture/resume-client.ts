import { putCapture as putStoredCapture, readChunk as readStoredChunk, type CaptureRecord } from "./db";
import { captureStatusLabel, missingIndices } from "./plan";

export async function resumeCapture(record: CaptureRecord, options: {
  online: boolean;
  fetchImpl?: typeof fetch;
  onStatus: (text: string) => void;
  readChunk?: (captureId: string, index: number) => Promise<Blob | null>;
  putCapture?: (record: CaptureRecord) => Promise<void>;
}): Promise<unknown | null> {
  const fetchImpl = options.fetchImpl ?? fetch;
  const readChunk = options.readChunk ?? readStoredChunk;
  const putCapture = options.putCapture ?? putStoredCapture;
  if (!options.online) {
    options.onStatus(captureStatusLabel({ online: false, phase: record.status === "recording" ? "recording" : "saved", sent: 0, total: record.totalChunks }));
    return null;
  }
  let current = record;
  if (!current.uploadId) current = await openUpload(current, fetchImpl, putCapture);
  let statusResponse = await fetchImpl(`/api/measure/uploads/${current.uploadId}`);
  if (statusResponse.status === 404) {
    current = { ...current, uploadId: null, status: "saved", error: null };
    await putCapture(current);
    current = await openUpload(current, fetchImpl, putCapture);
    statusResponse = await fetchImpl(`/api/measure/uploads/${current.uploadId}`);
  }
  if (!statusResponse.ok) throw new Error("Upload status could not be read.");
  const status = await statusResponse.json() as { received?: number[] };
  const missing = missingIndices(status.received ?? [], current.totalChunks);
  let sent = current.totalChunks - missing.length;
  for (const index of missing) {
    options.onStatus(captureStatusLabel({ online: true, phase: "uploading", sent, total: current.totalChunks }));
    const blob = await readChunk(current.id, index);
    if (!blob) throw new Error("A saved chunk is missing on this phone.");
    const response = await fetchImpl(`/api/measure/uploads/${current.uploadId}`, {
      method: "PUT",
      headers: { "x-chunk-index": String(index), "content-type": "application/octet-stream" },
      body: blob,
    });
    if (!response.ok) throw new Error("A chunk did not upload.");
    sent += 1;
  }
  options.onStatus(captureStatusLabel({ online: true, phase: "processing", sent: current.totalChunks, total: current.totalChunks }));
  current = { ...current, status: "processing" };
  await putCapture(current);
  const finished = await fetchImpl(`/api/measure/uploads/${current.uploadId}/finish`, { method: "POST" });
  const body = await finished.json().catch(() => null);
  if (!finished.ok) throw new Error(body && typeof body === "object" && "error" in body ? String(body.error) : "Server processing failed.");
  await putCapture({ ...current, status: "done", error: null });
  options.onStatus(captureStatusLabel({ online: true, phase: "done", sent: current.totalChunks, total: current.totalChunks }));
  return body;
}

async function openUpload(
  current: CaptureRecord,
  fetchImpl: typeof fetch,
  putCapture: (record: CaptureRecord) => Promise<void>,
): Promise<CaptureRecord> {
  const created = await fetchImpl("/api/measure/uploads", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ filename: current.filename, mimeType: current.mime, totalChunks: current.totalChunks }),
  });
  if (!created.ok) throw new Error("Upload could not be started.");
  const payload = await created.json() as { id?: string };
  if (!payload.id) throw new Error("Upload could not be started.");
  const next = { ...current, uploadId: payload.id, status: "uploading" as const, error: null };
  await putCapture(next);
  return next;
}
