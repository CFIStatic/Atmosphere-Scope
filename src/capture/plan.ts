export function missingIndices(received: number[], total: number): number[] {
  const have = new Set(received);
  const missing: number[] = [];
  for (let index = 0; index < total; index += 1) {
    if (!have.has(index)) missing.push(index);
  }
  return missing;
}

export function captureStatusLabel(input: {
  online: boolean;
  phase: "recording" | "saved" | "uploading" | "processing" | "done" | "error";
  sent: number;
  total: number;
}): string {
  if (input.phase === "error") return "Upload paused. It will retry when the connection returns.";
  if (input.phase === "recording" && !input.online) return "Offline. Still recording. This phone keeps the video until a connection returns.";
  if (input.phase === "recording") return "Recording. Saved on this phone as you go.";
  if (!input.online || input.phase === "saved") return "Saved on this phone. Upload waits for a connection.";
  if (input.phase === "uploading") return `Uploading ${input.sent} of ${input.total} chunks. Measurement stays on the server.`;
  if (input.phase === "processing") return "Upload complete. Processing on the server.";
  if (input.phase === "done") return "Upload complete.";
  return "Upload paused. It will retry when the connection returns.";
}
