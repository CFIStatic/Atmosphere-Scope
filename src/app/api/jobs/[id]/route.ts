import { NextResponse } from "next/server";
import { loadVisibleJob } from "@/storage/visible-jobs";

export async function GET(_request: Request, context: { params: Promise<{ id: string }> }) {
  const { id } = await context.params;
  const loaded = await loadVisibleJob(id);
  if ("error" in loaded) return NextResponse.json({ error: loaded.error }, { status: loaded.status });
  return NextResponse.json(loaded.job);
}
