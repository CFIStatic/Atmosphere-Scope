import { NextResponse } from "next/server";
import { createEmptyJob } from "@/analysis/pipeline";
import { draftJobInput } from "@/domain/job-identity";
import { saveJob } from "@/storage/job-store";
import { assertJobWriter, listVisibleJobs } from "@/storage/visible-jobs";

export async function GET() {
  const jobs = await listVisibleJobs();
  return NextResponse.json({
    jobs: jobs.map((job) => ({
      id: job.id,
      address: job.property.address,
      customer: job.customer.name,
    })),
  });
}

export async function POST(request: Request) {
  const writer = await assertJobWriter();
  if ("error" in writer) return NextResponse.json({ error: writer.error }, { status: writer.status });
  const body = await request.json();
  if (body.draft === true) {
    const job = await saveJob(createEmptyJob(draftJobInput()));
    return NextResponse.json({ jobId: job.id });
  }
  const required = ["address", "city", "region", "postalCode", "customerName", "concern"] as const;
  for (const key of required) {
    if (!String(body[key] ?? "").trim()) return NextResponse.json({ error: `${key} is required.` }, { status: 400 });
  }
  const job = await saveJob(createEmptyJob({
    address: String(body.address),
    city: String(body.city),
    region: String(body.region),
    postalCode: String(body.postalCode),
    customerName: String(body.customerName),
    phone: String(body.phone ?? ""),
    email: String(body.email ?? ""),
    concern: String(body.concern),
  }));
  return NextResponse.json({ jobId: job.id });
}
