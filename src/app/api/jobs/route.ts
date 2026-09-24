import { NextResponse } from "next/server";
import { createEmptyJob } from "@/analysis/pipeline";
import { saveJob } from "@/storage/job-store";

export async function POST(request: Request) {
  const body = await request.json();
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
