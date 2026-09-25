import { NextResponse } from "next/server";
import { createUploadStore } from "@/capture/uploads";

export const runtime = "nodejs";

export async function POST(request: Request) {
  const body = await request.json().catch(() => null) as { filename?: unknown; mimeType?: unknown; totalChunks?: unknown } | null;
  if (!body || typeof body.totalChunks !== "number") return NextResponse.json({ error: "Say how many chunks are in the upload." }, { status: 400 });
  try {
    const id = await createUploadStore().create({
      filename: typeof body.filename === "string" ? body.filename : "walkthrough.webm",
      mime: typeof body.mimeType === "string" ? body.mimeType : "video/webm",
      totalChunks: body.totalChunks,
    });
    return NextResponse.json({ id });
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : "Upload was not created." }, { status: 400 });
  }
}
