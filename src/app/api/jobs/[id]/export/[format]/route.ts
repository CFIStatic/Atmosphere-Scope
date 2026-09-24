import { NextResponse } from "next/server";
import { estimateCsv, jobPdf, sketchSvg } from "@/export/package";
import { getJob } from "@/storage/job-store";

export async function GET(_request: Request, context: { params: Promise<{ id: string; format: string }> }) {
  const { id, format } = await context.params;
  const job = await getJob(id);
  if (!job) return NextResponse.json({ error: "Job not found." }, { status: 404 });
  if (format === "csv") return new NextResponse(estimateCsv(job), { headers: { "content-type": "text/csv", "content-disposition": `attachment; filename="${id}-estimate.csv"` } });
  if (format === "svg") return new NextResponse(sketchSvg(job), { headers: { "content-type": "image/svg+xml", "content-disposition": `attachment; filename="${id}-sketch.svg"` } });
  if (format === "pdf") {
    const pdf = await jobPdf(job);
    return new NextResponse(Buffer.from(pdf), { headers: { "content-type": "application/pdf", "content-disposition": `attachment; filename="${id}-package.pdf"` } });
  }
  if (format === "json") return NextResponse.json(job, { headers: { "content-disposition": `attachment; filename="${id}-package.json"` } });
  return NextResponse.json({ error: "Unknown export." }, { status: 404 });
}
