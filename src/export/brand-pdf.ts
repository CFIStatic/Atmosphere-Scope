import { readFile } from "node:fs/promises";
import path from "node:path";
import type { PDFDocument, PDFFont, PDFPage } from "pdf-lib";

const LOCKUP = path.join(process.cwd(), "public/brand/lockup-transparent-for-light-bg.png");

/**
 * Draws the transparent light-background lockup at its native aspect ratio,
 * 200pt wide and left-aligned on the white page.
 * Returns the baseline for the next line: 16pt below the image, then one
 * font-ascent lower, so the following glyphs do not cover the lockup.
 */
export async function paintLightLockup(pdf: PDFDocument, page: PDFPage, next: { font: PDFFont; size: number }): Promise<number> {
  const bytes = await readFile(LOCKUP);
  const image = await pdf.embedPng(bytes);
  const width = 200;
  const height = width * (image.height / image.width);
  const imageBottom = page.getHeight() - 36 - height;
  page.drawImage(image, { x: 40, y: imageBottom, width, height });
  const ascent = next.font.heightAtSize(next.size, { descender: false });
  return imageBottom - 16 - ascent;
}
