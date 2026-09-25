import { NextResponse } from "next/server";
import { createUploadStore } from "@/capture/uploads";

export const runtime = "nodejs";

export async function GET(_request: Request, context: { params: Promise<{ id: string }> }) {
  const { id } = await context.params;
  try {
    return NextResponse.json(await createUploadStore().status(id));
  } catch {
    return NextResponse.json({ error: "Unknown upload." }, { status: 404 });
  }
}

export async function PUT(request: Request, context: { params: Promise<{ id: string }> }) {
  const { id } = await context.params;
  const index = Number(request.headers.get("x-chunk-index"));
  try {
    const bytes = new Uint8Array(await request.arrayBuffer());
    return NextResponse.json(await createUploadStore().writeChunk(id, index, bytes));
  } catch (error) {
    const message = error instanceof Error ? error.message : "Chunk was not stored.";
    const status = message === "Unknown upload." ? 404 : 400;
    return NextResponse.json({ error: message }, { status });
  }
}
