import { NextResponse } from "next/server";
import { reportCsv, type EstimateReport } from "@/domain/estimate-engine";
import { reportPdf } from "@/export/report-pdf";

export async function POST(request: Request) {
  const body = (await request.json()) as { report?: EstimateReport; format?: string };
  const report = body.report;
  if (!report || report.schema !== "atmosphere.estimate.v1" || !Array.isArray(report.lines)) {
    return NextResponse.json({ error: "Expected an atmosphere.estimate.v1 report." }, { status: 400 });
  }
  if (body.format === "csv") return new NextResponse(reportCsv(report), { headers: { "content-type": "text/csv", "content-disposition": "attachment; filename=estimate.csv" } });
  if (body.format === "pdf") {
    const pdf = await reportPdf(report);
    return new NextResponse(Buffer.from(pdf), { headers: { "content-type": "application/pdf", "content-disposition": "attachment; filename=estimate.pdf" } });
  }
  return NextResponse.json(report, { headers: { "content-disposition": "attachment; filename=estimate.json" } });
}
