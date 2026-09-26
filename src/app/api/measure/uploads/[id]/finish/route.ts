import { mkdtemp, readFile, rm } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { NextResponse } from "next/server";
import { measureVideoFile } from "@/analysis/run-measurement";
import { createUploadStore } from "@/capture/uploads";
import type { MediaAsset } from "@/domain/types";
import { saveMediaFile } from "@/storage/job-store";

export const runtime = "nodejs";
export const maxDuration = 120;

export async function POST(_request: Request, context: { params: Promise<{ id: string }> }) {
  const { id } = await context.params;
  const store = createUploadStore();
  const directory = await mkdtemp(path.join(os.tmpdir(), "scope-upload-"));
  try {
    const meta = await store.assemble(id, path.join(directory, "walkthrough.mp4"));
    const videoPath = path.join(directory, "walkthrough.mp4");
    const jobId = new URL(_request.url).searchParams.get("jobId");
    const measured = await measureVideoFile(videoPath, { name: meta.filename, type: meta.mime }, jobId);
    if (!measured.ok) return NextResponse.json(measured.body, { status: measured.status });
    const bytes = await readFile(videoPath);
    const media: MediaAsset = {
      id,
      kind: "video",
      filename: meta.filename,
      mimeType: meta.mime || "video/webm",
      byteSize: bytes.length,
      storageKey: null,
      roomId: null,
      label: "Walkthrough video",
      createdAt: new Date().toISOString(),
    };
    const videoKey = await saveMediaFile("walkthroughs", media, bytes);
    await store.remove(id);
    const body = measured.body && typeof measured.body === "object" ? { ...measured.body, videoKey, videoStored: true } : measured.body;
    return NextResponse.json(body);
  } catch (error) {
    const message = error instanceof Error ? error.message : "Upload could not be finished.";
    const status = message === "Unknown upload." ? 404 : 409;
    return NextResponse.json({ error: message }, { status });
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
}
