import { NextResponse } from "next/server";
import { getJob, readMediaFile } from "@/storage/job-store";

export async function GET(_request: Request, context: { params: Promise<{ id: string; mediaId: string }> }) {
  const { id, mediaId } = await context.params;
  const job = await getJob(id);
  const media = job?.media.find((item) => item.id === mediaId);
  if (!job || !media?.storageKey) return NextResponse.json({ error: "Media not found." }, { status: 404 });
  const bytes = await readMediaFile(media.storageKey);
  if (!bytes) return NextResponse.json({ error: "File missing." }, { status: 404 });
  return new NextResponse(new Uint8Array(bytes), { headers: { "content-type": media.mimeType, "cache-control": "private, max-age=3600" } });
}
