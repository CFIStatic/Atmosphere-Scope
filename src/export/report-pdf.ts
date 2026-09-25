import type { EstimateReport } from "@/domain/estimate-engine";
import { formatDate } from "@/domain/format";
import { DRAFT_BANNER } from "@/domain/types";
import { pitchbookPdf } from "@/export/pitchbook";

export async function reportPdf(report: EstimateReport): Promise<Uint8Array> {
  return pitchbookPdf({
    property: report.region && report.region !== "Unspecified" ? report.region : "—",
    jobNumber: "—",
    date: formatDate(report.createdAt),
    preparedBy: "Atmosphere Scope",
    status: report.status === "final" ? "Final" : "Draft",
    lines: report.lines.map((line) => ({
      room: line.room,
      description: line.description,
      quantity: line.quantity,
      unit: line.unit,
      amount: line.lineTotal,
    })),
    totals: [{ label: "Total", amount: report.pricedTotal, grand: true }],
    footnote: report.status === "final" ? "Finalized copy." : DRAFT_BANNER,
  });
}
