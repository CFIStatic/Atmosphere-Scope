import { NextResponse } from "next/server";
import { createId, nowIso } from "@/domain/ids";
import type { MediaKind } from "@/domain/types";
import { getJob, saveJob, saveMediaFile } from "@/storage/job-store";
import { importDepthPayload, isDepthPayload } from "@/spatial/depth";

export async function POST(request: Request, context: { params: Promise<{ id: string }> }) {
  const { id } = await context.params;
  const job = await getJob(id);
  if (!job) return NextResponse.json({ error: "Job not found." }, { status: 404 });
  const form = await request.formData();
  const file = form.get("file");
  if (!(file instanceof File)) return NextResponse.json({ error: "Choose a file." }, { status: 400 });
  const kind = kindFor(file.type, file.name);
  const media = {
    id: createId("med"),
    kind,
    filename: file.name,
    mimeType: file.type || "application/octet-stream",
    byteSize: file.size,
    storageKey: null as string | null,
    roomId: null,
    label: String(form.get("label") ?? file.name),
    createdAt: nowIso(),
    note: kind === "depth" ? "Stored privately. Automatic reconstruction runs only for atmosphere-depth-v1 JSON." : "Original file retained.",
  };
  const bytes = Buffer.from(await file.arrayBuffer());
  media.storageKey = await saveMediaFile(id, media, bytes);
  let nextJob = { ...job, media: [...job.media, media] };
  if (kind === "depth" && /json$/i.test(file.name)) {
    try {
      const parsed = JSON.parse(bytes.toString("utf8"));
      if (isDepthPayload(parsed)) nextJob = { ...importDepthPayload(nextJob, parsed), media: nextJob.media };
    } catch {
      media.note = "Depth file stored. It is not atmosphere-depth-v1, so no geometry was imported.";
    }
  }
  const next = await saveJob(nextJob);
  return NextResponse.json({ job: next, mediaId: media.id });
}

function kindFor(mime: string, name: string): MediaKind {
  if (mime.startsWith("video")) return "video";
  if (mime.startsWith("image")) return "photo";
  if (mime.startsWith("audio")) return "audio";
  if (/\.(ply|obj|json|laz|las)$/i.test(name)) return "depth";
  if (/plan|floor/i.test(name)) return "floor_plan";
  return "photo";
}
