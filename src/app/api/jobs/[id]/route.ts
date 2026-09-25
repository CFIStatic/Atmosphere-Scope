import { NextResponse } from "next/server";
import { applyJobIdentity, type JobLocation } from "@/domain/job-identity";
import { saveJob } from "@/storage/job-store";
import { assertJobWriter, loadVisibleJob } from "@/storage/visible-jobs";

export async function GET(_request: Request, context: { params: Promise<{ id: string }> }) {
  const { id } = await context.params;
  const loaded = await loadVisibleJob(id);
  if ("error" in loaded) return NextResponse.json({ error: loaded.error }, { status: loaded.status });
  return NextResponse.json(loaded.job);
}

export async function PATCH(request: Request, context: { params: Promise<{ id: string }> }) {
  const writer = await assertJobWriter();
  if ("error" in writer) return NextResponse.json({ error: writer.error }, { status: writer.status });
  const { id } = await context.params;
  const loaded = await loadVisibleJob(id);
  if ("error" in loaded) return NextResponse.json({ error: loaded.error }, { status: loaded.status });
  const body = await request.json();
  const job = await saveJob(applyJobIdentity(loaded.job, {
    address: typeof body.address === "string" ? body.address : undefined,
    city: typeof body.city === "string" ? body.city : undefined,
    region: typeof body.region === "string" ? body.region : undefined,
    postalCode: typeof body.postalCode === "string" ? body.postalCode : undefined,
    customerName: typeof body.customerName === "string" ? body.customerName : undefined,
    location: readLocation(body.location),
  }));
  return NextResponse.json({ jobId: job.id, address: job.property.address, customer: job.customer.name });
}

function readLocation(value: unknown): JobLocation | null {
  if (!value || typeof value !== "object") return null;
  const record = value as { lat?: unknown; lng?: unknown };
  if (typeof record.lat !== "number" || typeof record.lng !== "number") return null;
  if (!Number.isFinite(record.lat) || !Number.isFinite(record.lng)) return null;
  return { lat: record.lat, lng: record.lng };
}
