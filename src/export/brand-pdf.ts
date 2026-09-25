import { readFile } from "node:fs/promises";
import path from "node:path";
import type { PDFDocument, PDFPage } from "pdf-lib";

const LOCKUP = path.join(process.cwd(), "public/brand/lockup-on-light.png");

/** Draws the supplied light lockup. Returns the y position just below it. */
export async function paintLightLockup(pdf: PDFDocument, page: PDFPage): Promise<number> {
  const bytes = await readFile(LOCKUP);
  const image = await pdf.embedPng(bytes);
  const width = 280;
  const height = width * (image.height / image.width);
  const y = page.getHeight() - 28 - height;
  page.drawImage(image, { x: 36, y, width, height });
  return y - 18;
}
