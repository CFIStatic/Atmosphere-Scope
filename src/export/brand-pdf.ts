import { readFile } from "node:fs/promises";
import path from "node:path";
import type { PDFDocument, PDFPage } from "pdf-lib";

const LOCKUP = path.join(process.cwd(), "public/brand/lockup-transparent-for-light-bg.png");

/** Draws the transparent light-background lockup, left-aligned on the white page. */
export async function paintLightLockup(pdf: PDFDocument, page: PDFPage): Promise<number> {
  const bytes = await readFile(LOCKUP);
  const image = await pdf.embedPng(bytes);
  const width = 200;
  const height = width * (image.height / image.width);
  const y = page.getHeight() - 36 - height;
  page.drawImage(image, { x: 40, y, width, height });
  return y - 16;
}
