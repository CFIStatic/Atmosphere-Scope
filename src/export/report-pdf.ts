import { PDFDocument, StandardFonts, rgb } from "pdf-lib";
import type { EstimateReport } from "@/domain/estimate-engine";
import { paintLightLockup } from "@/export/brand-pdf";

export async function reportPdf(report: EstimateReport): Promise<Uint8Array> {
  const pdf = await PDFDocument.create();
  const font = await pdf.embedFont(StandardFonts.Helvetica);
  let page = pdf.addPage([612, 792]);
  let y = await paintLightLockup(pdf, page);
  const write = async (text: string, size = 11) => {
    if (y < 48) {
      page = pdf.addPage([612, 792]);
      y = await paintLightLockup(pdf, page);
    }
    page.drawText(text.slice(0, 110), { x: 40, y, size, font, color: rgb(0.09, 0.1, 0.11) });
    y -= size + 6;
  };
  await write(`Atmosphere Scope estimate ${report.status}`, 16);
  await write(`Catalog ${report.catalogVersionId} · Rates ${report.rateBookId} · ${report.region}`);
  await write(report.note, 10);
  for (const line of report.lines) {
    await write(`${line.room} · ${line.code} · ${line.description}`);
    await write(`  ${line.quantity ?? "—"} ${line.unit} · line ${line.lineTotal ?? "unpriced"}`, 10);
    for (const component of line.componentsPriced) await write(`  ${component.label}: ${component.amount ?? "unpriced"} · ${component.source} · ${component.asOf ?? "no date"}`, 9);
    for (const gap of line.unpriced) await write(`  ${gap}`, 9);
  }
  await write(report.pricedTotal == null ? "No complete total." : `Priced lines total ${report.pricedTotal}. Unpriced lines: ${report.unpricedCount}.`);
  return pdf.save();
}
