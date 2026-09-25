import { NextResponse } from "next/server";
import { measureVideoBytes } from "@/analysis/run-measurement";

export const runtime = "nodejs";
export const maxDuration = 120;

export async function POST(request: Request) {
  const form = await request.formData();
  const video = form.get("video");
  if (!(video instanceof File)) return NextResponse.json({ error: "Attach a walkthrough video." }, { status: 400 });
  const measured = await measureVideoBytes(new Uint8Array(await video.arrayBuffer()), { name: video.name, type: video.type });
  if (!measured.ok) return NextResponse.json(measured.body, { status: measured.status });
  return NextResponse.json(measured.body);
}
