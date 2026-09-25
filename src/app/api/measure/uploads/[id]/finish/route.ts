import { mkdtemp, rm } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { NextResponse } from "next/server";
import { measureVideoFile } from "@/analysis/run-measurement";
import { createUploadStore } from "@/capture/uploads";

export const runtime = "nodejs";
export const maxDuration = 120;

export async function POST(_request: Request, context: { params: Promise<{ id: string }> }) {
  const { id } = await context.params;
  const store = createUploadStore();
  const directory = await mkdtemp(path.join(os.tmpdir(), "scope-upload-"));
  try {
    const meta = await store.assemble(id, path.join(directory, "walkthrough.mp4"));
    const measured = await measureVideoFile(path.join(directory, "walkthrough.mp4"), { name: meta.filename, type: meta.mime });
    if (!measured.ok) return NextResponse.json(measured.body, { status: measured.status });
    await store.remove(id);
    return NextResponse.json(measured.body);
  } catch (error) {
    const message = error instanceof Error ? error.message : "Upload could not be finished.";
    const status = message === "Unknown upload." ? 404 : 409;
    return NextResponse.json({ error: message }, { status });
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
}
