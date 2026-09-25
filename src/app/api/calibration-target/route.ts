import { readFile } from "fs/promises";
import path from "path";
import { PDFDocument, StandardFonts, rgb } from "pdf-lib";
import { NextResponse } from "next/server";

export const runtime = "nodejs";

export async function GET() {
  const png = await readFile(path.join(process.cwd(), "public/calibration/charuco-letter.png"));
  const pdf = await PDFDocument.create();
  const page = pdf.addPage([612, 792]);
  const font = await pdf.embedFont(StandardFonts.Courier);
  const image = await pdf.embedPng(png);
  // Physical size of the rendered sheet, including the 12 mm margin. Do not fit-to-page.
  const width = ((0.03 * 5 + 0.012 * 2) / 0.0254) * 72;
  const height = ((0.03 * 7 + 0.012 * 2) / 0.0254) * 72;
  page.drawImage(image, { x: (612 - width) / 2, y: (792 - height) / 2 - 10, width, height });
  page.drawText("Atmosphere Scope calibration sheet  ·  DICT 4x4  ·  5x7 squares  ·  square 30 mm  ·  marker 22 mm", {
    x: 36,
    y: 752,
    size: 8,
    font,
    color: rgb(0.1, 0.1, 0.1),
  });
  page.drawText("Print on US Letter at 100% scale. Turn off Fit to page. The 30 mm square is the scale the solver trusts.", {
    x: 36,
    y: 48,
    size: 9,
    font,
    color: rgb(0.1, 0.1, 0.1),
  });
  const bytes = await pdf.save();
  return new NextResponse(Buffer.from(bytes), {
    headers: {
      "content-type": "application/pdf",
      "content-disposition": "attachment; filename=atmosphere-charuco-letter.pdf",
    },
  });
}
