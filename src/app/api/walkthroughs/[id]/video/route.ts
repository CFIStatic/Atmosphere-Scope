import { NextResponse } from "next/server";
import type { MediaAsset } from "@/domain/types";
import { getWalkthrough, storeWalkthrough } from "@/storage/walkthrough-store";
import { saveMediaFile } from "@/storage/job-store";

export const runtime = "nodejs";

export async function POST(request: Request, context: { params: Promise<{ id: string }> }) {
  const { id } = await context.params;
  const current = await getWalkthrough(id);
  if (!current) return NextResponse.json({ error: "Save the walkthrough before uploading its video." }, { status: 404 });
  const bytes = Buffer.from(await request.arrayBuffer());
  if (!bytes.length) return NextResponse.json({ error: "The video was empty. Nothing was stored." }, { status: 400 });
  const media: MediaAsset = {
    id,
    kind: "video",
    filename: "walkthrough.webm",
    mimeType: request.headers.get("content-type") || "video/webm",
    byteSize: bytes.length,
    storageKey: null,
    roomId: null,
    label: "Walkthrough video",
    createdAt: new Date().toISOString(),
  };
  try {
    const videoKey = await saveMediaFile("walkthroughs", media, bytes);
    const record = await storeWalkthrough(id, current.snapshot, videoKey);
    return NextResponse.json({ record, videoKey });
  } catch (error) {
    const message = error instanceof Error ? error.message : "The video was not stored.";
    return NextResponse.json({ error: message }, { status: 409 });
  }
}
