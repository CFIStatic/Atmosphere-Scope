import { NextResponse } from "next/server";
import { eventsForJob } from "@/storage/workspace-book";
import { loadVisibleJob } from "@/storage/visible-jobs";

function localDateKey(value: string): string {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "";
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${date.getFullYear()}-${month}-${day}`;
}

export async function GET(_request: Request, context: { params: Promise<{ id: string }> }) {
  const { id } = await context.params;
  const loaded = await loadVisibleJob(id);
  if ("error" in loaded) return NextResponse.json({ error: loaded.error }, { status: loaded.status });
  const events = await eventsForJob(id);
  const today = localDateKey(new Date().toISOString());
  return NextResponse.json({
    events,
    today: events.filter((event) => localDateKey(event.createdAt) === today).map((event) => event.summary),
  });
}
