import { PDFDocument, StandardFonts, rgb, type PDFFont, type PDFPage } from "pdf-lib";
import { paintLightLockup } from "@/export/brand-pdf";

export type PitchLine = {
  room: string;
  description: string;
  quantity: number | null;
  unit: string;
  amount: number | null;
};

export type PitchTotal = { label: string; amount: number | null; grand?: boolean };

export type Pitchbook = {
  property: string;
  jobNumber: string;
  date: string;
  preparedBy: string;
  status: string;
  lines: PitchLine[];
  totals: PitchTotal[];
  footnote: string;
};

const INK = rgb(0.094, 0.098, 0.106);
const MUTED = rgb(0.42, 0.42, 0.41);
const RULE = rgb(0.62, 0.62, 0.61);
const HAIR = rgb(0.78, 0.78, 0.76);
const MARGIN = 54;
const PAGE: [number, number] = [612, 792];
const RIGHT = 558;
const FLOOR = 64;

export async function pitchbookPdf(input: Pitchbook): Promise<Uint8Array> {
  const pdf = await PDFDocument.create();
  const font = await pdf.embedFont(StandardFonts.Helvetica);
  const medium = await pdf.embedFont(StandardFonts.HelveticaBold);
  const pages: PDFPage[] = [];
  let page = pdf.addPage(PAGE);
  pages.push(page);
  let y = await paintLightLockup(pdf, page, { font, size: 11 });
  page.drawLine({ start: { x: MARGIN, y: y + 8 }, end: { x: RIGHT, y: y + 8 }, thickness: 0.6, color: RULE });
  y -= 8;
  page.drawText("Estimate", { x: MARGIN, y, size: 16, font: medium, color: INK });
  y -= 22;
  for (const [label, value] of [
    ["Property", input.property || "—"],
    ["Claim / Job #", input.jobNumber || "—"],
    ["Date", input.date || "—"],
    ["Prepared by", input.preparedBy || "Atmosphere Scope"],
  ] as const) {
    y = pair(page, font, y, label, value);
  }
  y -= 6;
  y = pair(page, font, y, "Summary", "");
  const priced = input.lines.filter((line) => line.amount != null).length;
  y = pair(page, font, y, "Status", input.status || "Draft");
  y = pair(page, font, y, "Lines", String(input.lines.length));
  y = pair(page, font, y, "Priced", String(priced));
  y = pair(page, font, y, "Unpriced", String(input.lines.length - priced));
  y -= 8;
  page.drawText("LINE ITEMS", { x: MARGIN, y, size: 8, font, color: MUTED });
  y -= 14;
  y = columnHeads(page, font, y);

  const openPage = () => {
    page = pdf.addPage(PAGE);
    pages.push(page);
    y = page.getHeight() - 48;
    page.drawText("Atmosphere Scope", { x: MARGIN, y: y + 10, size: 9, font, color: MUTED });
    page.drawLine({ start: { x: MARGIN, y: y + 4 }, end: { x: RIGHT, y: y + 4 }, thickness: 0.4, color: RULE });
    y -= 16;
    y = columnHeads(page, font, y);
  };
  const roomFor = (space: number) => {
    if (y - space < FLOOR) openPage();
  };

  const rooms = [...new Set(input.lines.map((line) => line.room || "Unassigned"))];
  for (const room of rooms) {
    const group = input.lines.filter((line) => (line.room || "Unassigned") === room);
    roomFor(32);
    page.drawText(clip(room, font, 9, 240), { x: MARGIN, y, size: 9, font: medium, color: INK });
    y -= 13;
    let subtotal = 0;
    let priced = 0;
    for (const line of group) {
      roomFor(22);
      paintLine(page, font, y, line);
      y -= 3;
      page.drawLine({ start: { x: MARGIN, y }, end: { x: RIGHT, y }, thickness: 0.3, color: HAIR });
      y -= 12;
      if (line.amount != null) {
        priced += 1;
        subtotal += line.amount;
      }
    }
    roomFor(18);
    page.drawLine({ start: { x: MARGIN, y: y + 10 }, end: { x: RIGHT, y: y + 10 }, thickness: 0.6, color: RULE });
    paintTotal(page, font, medium, y, `${room} subtotal`, priced ? round2(subtotal) : null, false);
    y -= 16;
  }

  roomFor(20 + input.totals.length * 16);
  for (const total of input.totals) {
    page.drawLine({ start: { x: 340, y: y + 11 }, end: { x: RIGHT, y: y + 11 }, thickness: total.grand ? 1 : 0.5, color: total.grand ? INK : RULE });
    paintTotal(page, font, medium, y, total.label, total.amount, !!total.grand);
    y -= 16;
  }
  if (input.lines.some((line) => line.amount == null)) {
    roomFor(14);
    page.drawText("Unpriced lines excluded.", { x: MARGIN, y, size: 8, font, color: MUTED });
  }

  pages.forEach((item, index) => {
    const width = item.getWidth();
    item.drawLine({ start: { x: MARGIN, y: 46 }, end: { x: width - MARGIN, y: 46 }, thickness: 0.4, color: RULE });
    if (index === 0 && input.footnote) item.drawText(clip(input.footnote, font, 8, width - MARGIN * 2), { x: MARGIN, y: 34, size: 8, font, color: MUTED });
    item.drawText("Prepared by Atmosphere Scope. Draft until finalized.", { x: MARGIN, y: 22, size: 8, font, color: MUTED });
    const label = String(index + 1);
    item.drawText(label, { x: width - MARGIN - font.widthOfTextAtSize(label, 8), y: 22, size: 8, font, color: MUTED });
  });
  return pdf.save();
}

function pair(page: PDFPage, font: PDFFont, y: number, label: string, value: string): number {
  page.drawText(label.toUpperCase(), { x: MARGIN, y, size: 8, font, color: MUTED });
  if (value) page.drawText(clip(value, font, 10, 340), { x: 180, y, size: 10, font, color: INK });
  return y - 14;
}

function columnHeads(page: PDFPage, font: PDFFont, y: number): number {
  const heads: [string, number, number, "left" | "right"][] = [
    ["Description", MARGIN, 246, "left"],
    ["Qty", 310, 70, "right"],
    ["Unit", 390, 50, "left"],
    ["Amount", 448, 110, "right"],
  ];
  for (const [label, x, width, align] of heads) {
    const text = label.toUpperCase();
    const textWidth = font.widthOfTextAtSize(text, 8);
    page.drawText(text, { x: align === "right" ? x + width - textWidth : x, y, size: 8, font, color: MUTED });
  }
  page.drawLine({ start: { x: MARGIN, y: y - 4 }, end: { x: RIGHT, y: y - 4 }, thickness: 0.4, color: RULE });
  return y - 16;
}

function paintLine(page: PDFPage, font: PDFFont, y: number, line: PitchLine) {
  page.drawText(clip(line.description, font, 9, 246), { x: MARGIN, y, size: 9, font, color: INK });
  rightText(page, font, 9, y, 310, 70, line.quantity == null ? "—" : line.quantity.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 }));
  page.drawText(line.unit || "—", { x: 390, y, size: 9, font, color: INK });
  rightText(page, font, 9, y, 448, 110, line.amount == null ? "—" : money(line.amount));
}

function paintTotal(page: PDFPage, font: PDFFont, medium: PDFFont, y: number, label: string, amount: number | null, grand: boolean) {
  const face = grand ? medium : font;
  const size = grand ? 11 : 9;
  page.drawText(label, { x: 300, y, size, font: face, color: INK });
  rightText(page, face, size, y, 448, 110, amount == null ? "—" : money(amount));
}

function rightText(page: PDFPage, font: PDFFont, size: number, y: number, x: number, width: number, text: string) {
  page.drawText(text, { x: x + width - font.widthOfTextAtSize(text, size), y, size, font, color: INK });
}

function money(value: number): string {
  return value.toLocaleString("en-US", { style: "currency", currency: "USD" });
}

function round2(value: number): number {
  return Math.round(value * 100) / 100;
}

function clip(text: string, font: PDFFont, size: number, width: number): string {
  const clean = text.replace(/\s+/g, " ").trim() || "—";
  if (font.widthOfTextAtSize(clean, size) <= width) return clean;
  let next = clean;
  while (next.length > 1 && font.widthOfTextAtSize(`${next}…`, size) > width) next = next.slice(0, -1);
  return `${next}…`;
}
