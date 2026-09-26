import { NextResponse } from "next/server";
import { getActor } from "@/auth/request-session";
import { defaultsSummary } from "@/domain/workspace";
import { estimateCsv, jobPdf, sketchSvg } from "@/export/package";
import { membershipFor } from "@/storage/workspace-book";
import { loadVisibleJob } from "@/storage/visible-jobs";

export async function GET(_request: Request, context: { params: Promise<{ id: string; format: string }> }) {
  const { id, format } = await context.params;
  const loaded = await loadVisibleJob(id);
  if ("error" in loaded) return NextResponse.json({ error: loaded.error }, { status: loaded.status });
  const job = loaded.job;
  if (format === "csv") return new NextResponse(estimateCsv(job), { headers: { "content-type": "text/csv", "content-disposition": `attachment; filename="${id}-estimate.csv"` } });
  if (format === "svg") return new NextResponse(sketchSvg(job), { headers: { "content-type": "image/svg+xml", "content-disposition": `attachment; filename="${id}-sketch.svg"` } });
  if (format === "pdf") {
    const { actor } = await getActor();
    const membership = actor ? await membershipFor(actor.userId).catch(() => null) : null;
    const pdf = await jobPdf(job, membership ? {
      company: membership.org.name,
      license: membership.org.licenseNumbers,
      estimateDefaults: defaultsSummary(membership.defaults),
    } : undefined);
    return new NextResponse(Buffer.from(pdf), { headers: { "content-type": "application/pdf", "content-disposition": `attachment; filename="${id}-package.pdf"` } });
  }
  if (format === "json") return NextResponse.json(job, { headers: { "content-disposition": `attachment; filename="${id}-package.json"` } });
  return NextResponse.json({ error: "Unknown export." }, { status: 404 });
}
