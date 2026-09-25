import { PDFDocument, StandardFonts, rgb } from "pdf-lib";
import { bannerFor } from "@/domain/review";
import type { Job, SketchRoom } from "@/domain/types";
import { boundsOf, edgeLength } from "@/domain/geometry";
import { paintLightLockup } from "@/export/brand-pdf";

export function estimateCsv(job: Job): string {
  const version = job.estimates.find((item) => item.id === job.activeEstimateId) ?? job.estimates.at(-1);
  const header = ["version", "status", "phase", "class", "code", "location", "description", "qty", "unit", "qty_status", "formula", "unit_price", "extended", "pricing_source", "reason"];
  const lines = [header.join(",")];
  for (const item of job.scopeItems.filter((entry) => !version || version.scopeItemIds.includes(entry.id) || version.scopeItemIds.length === 0)) {
    const priced = version?.pricedLines.find((line) => line.scopeItemId === item.id);
    lines.push(
      [
        version?.number ?? "",
        version?.status ?? "",
        item.phase,
        item.scopeClass,
        item.code,
        csv(item.location),
        csv(item.description),
        item.quantity.value ?? "",
        item.quantity.unit,
        item.quantity.status,
        csv(item.quantity.formula ?? ""),
        priced?.unitPrice ?? "",
        priced?.extendedPrice ?? "",
        csv(priced?.pricingSource ?? ""),
        csv(item.reason),
      ].join(","),
    );
  }
  return lines.join("\n");
}

function csv(value: string): string {
  return `"${value.replace(/"/g, '""')}"`;
}

export function sketchSvg(job: Job): string {
  const rooms = job.sketch.geometry.rooms;
  const box = boundsOf(rooms);
  const pad = 2;
  const minX = box.minX - pad;
  const minY = box.minY - pad;
  const width = Math.max(12, box.maxX - box.minX + pad * 2);
  const height = Math.max(10, box.maxY - box.minY + pad * 2);
  const parts: string[] = [];
  parts.push(`<svg xmlns="http://www.w3.org/2000/svg" viewBox="${minX} ${minY} ${width} ${height}" role="img" aria-label="Job sketch">`);
  parts.push(`<rect x="${minX}" y="${minY}" width="${width}" height="${height}" fill="#f6f3ec"/>`);
  parts.push(`<text x="${minX + 0.3}" y="${minY + 0.8}" font-size="0.55" fill="#1c1915">${escapeXml(job.sketch.disclaimer)} ${job.sketch.scaleClaim === "to_scale" ? "To scale." : "Not to scale."} State: ${job.sketch.state}</text>`);
  for (const room of rooms) {
    const roomRecord = job.rooms.find((item) => item.id === room.roomId);
    const dash = room.provenance === "confirmed" ? "" : room.provenance === "user_corrected" ? `stroke-dasharray="0.15 0.12"` : `stroke-dasharray="0.35 0.2"`;
    parts.push(`<polygon points="${room.polygon.map((point) => `${point.x},${point.y}`).join(" ")}" fill="#efe6d4" stroke="#1c1915" stroke-width="0.08" ${dash}/>`);
    const label = centroid(room);
    parts.push(`<text x="${label.x}" y="${label.y}" font-size="0.45" text-anchor="middle" fill="#1c1915">${escapeXml(roomRecord?.name ?? "Room")} (${room.provenance})</text>`);
    room.polygon.forEach((point, index) => {
      const next = room.polygon[(index + 1) % room.polygon.length];
      const dim = job.sketch.geometry.dimensions.find((item) => item.target.type === "edge" && item.target.roomId === room.roomId && item.target.edgeIndex === index);
      const mid = { x: (point.x + next.x) / 2, y: (point.y + next.y) / 2 };
      const shown = dim?.valueFt ?? edgeLength(room.polygon, index);
      const style = dim?.status === "confirmed" ? "confirmed" : dim?.status === "conflicting" ? "conflict" : "inferred";
      parts.push(`<text x="${mid.x}" y="${mid.y - 0.15}" font-size="0.32" text-anchor="middle" fill="#0f4c4c">${shown == null ? "?" : shown.toFixed(1)} ft ${style}</text>`);
    });
  }
  for (const opening of job.sketch.geometry.openings) {
    const room = rooms.find((item) => item.roomId === opening.roomId);
    if (!room) continue;
    const a = room.polygon[opening.edgeIndex % room.polygon.length];
    const b = room.polygon[(opening.edgeIndex + 1) % room.polygon.length];
    parts.push(`<line x1="${a.x}" y1="${a.y}" x2="${b.x}" y2="${b.y}" stroke="${opening.kind === "door" ? "#a65a32" : "#0f4c4c"}" stroke-width="0.16" stroke-dasharray="${opening.connectionStatus === "confirmed" ? "0" : "0.2 0.12"}"/>`);
  }
  parts.push("</svg>");
  return parts.join("\n");
}

function centroid(room: SketchRoom): { x: number; y: number } {
  const x = room.polygon.reduce((sum, point) => sum + point.x, 0) / room.polygon.length;
  const y = room.polygon.reduce((sum, point) => sum + point.y, 0) / room.polygon.length;
  return { x, y };
}

function escapeXml(value: string): string {
  return value.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
}

export async function jobPdf(job: Job): Promise<Uint8Array> {
  const pdf = await PDFDocument.create();
  const font = await pdf.embedFont(StandardFonts.Helvetica);
  const bold = await pdf.embedFont(StandardFonts.HelveticaBold);
  const version = job.estimates.find((item) => item.id === job.activeEstimateId) ?? job.estimates.at(-1) ?? null;
  const pageSize: [number, number] = [612, 792];
  let page = pdf.addPage(pageSize);
  let y = await paintLightLockup(pdf, page);
  const draw = async (text: string, size = 10, useBold = false) => {
    const chunks = wrap(text, 90);
    for (const chunk of chunks) {
      if (y < 48) {
        page = pdf.addPage(pageSize);
        y = await paintLightLockup(pdf, page);
      }
      page.drawText(chunk, { x: 40, y, size, font: useBold ? bold : font, color: rgb(0.09, 0.1, 0.11) });
      y -= size + 4;
    }
  };
  await draw("Atmosphere Scope", 18, true);
  await draw(bannerFor(version), 12, true);
  await draw(`${job.property.address}, ${job.property.city} ${job.property.region} ${job.property.postalCode}`);
  await draw(`Customer: ${job.customer.name} · Estimate v${version?.number ?? "—"} · ${version?.status ?? "none"} · Sketch ${job.sketch.state} · ${job.sketch.scaleClaim === "to_scale" ? "To scale" : "Not to scale"}`);
  await draw(job.sketch.disclaimer);
  await draw(`Concern: ${job.concern}`);
  y -= 8;
  await draw("Assessment", 14, true);
  for (const finding of job.findings) {
    const room = job.rooms.find((item) => item.id === finding.roomId)?.name ?? "Unassigned";
    await draw(`${room} — ${finding.title} [${finding.evidenceClass}]`, 11, true);
    if (finding.observableCondition) await draw(`Observed: ${finding.observableCondition}`);
    if (finding.narratorReport) await draw(`Reported: ${finding.narratorReport}`);
    if (finding.interpretation) await draw(`Interpretation: ${finding.interpretation}`);
  }
  y -= 8;
  await draw("Scope and estimate", 14, true);
  await draw(`Price book: ${version?.priceBookLabel ?? "none"}`);
  for (const item of job.scopeItems) {
    const priced = version?.pricedLines.find((line) => line.scopeItemId === item.id);
    await draw(`${item.phase} / ${item.scopeClass} · ${item.location} · ${item.description}`, 10, true);
    await draw(`Qty ${item.quantity.value ?? "—"} ${item.quantity.unit} (${item.quantity.status}). ${item.quantity.formula ?? item.quantity.sourceNote}`);
    await draw(`Amount ${priced?.extendedPrice ?? "unpriced"} ${priced?.unpricedReason ?? ""}`.trim());
    await draw(item.reason);
  }
  if (version) {
    y -= 6;
    await draw(`Mitigation ${money(version.totals.mitigationSubtotal)} · Rebuild ${money(version.totals.rebuildSubtotal)} · Tax ${money(version.totals.tax)}`, 11, true);
    await draw(`Supported total ${money(version.totals.supportedTotal)} (${version.totals.label}). Conditional ${money(version.totals.conditionalAllowance)}. Optional ${money(version.totals.optionalAllowance)}.`);
    await draw("Assumptions", 12, true);
    for (const item of version.assumptions) await draw(`• ${item}`);
    await draw("Exclusions", 12, true);
    for (const item of version.exclusions) await draw(`• ${item}`);
  }
  await draw("AI output does not authorize work. Customer authorization applies only to the named estimate version.");
  return pdf.save();
}

function money(value: number): string {
  return `$${value.toFixed(2)}`;
}

function wrap(text: string, max: number): string[] {
  const words = text.split(/\s+/);
  const lines: string[] = [];
  let current = "";
  for (const word of words) {
    const next = current ? `${current} ${word}` : word;
    if (next.length > max) {
      if (current) lines.push(current);
      current = word;
    } else current = next;
  }
  if (current) lines.push(current);
  return lines.length ? lines : [""];
}
