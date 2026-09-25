import { bannerFor } from "@/domain/review";
import type { Job, SketchRoom } from "@/domain/types";
import { boundsOf, edgeLength } from "@/domain/geometry";
import { formatDate } from "@/domain/format";
import { pitchbookPdf } from "@/export/pitchbook";

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
  parts.push(`<rect x="${minX}" y="${minY}" width="${width}" height="${height}" fill="#f7f7f5"/>`);
  parts.push(`<text x="${minX + 0.3}" y="${minY + 0.8}" font-size="0.55" fill="#18191b">${escapeXml(job.sketch.disclaimer)} ${job.sketch.scaleClaim === "to_scale" ? "To scale." : "Not to scale."}</text>`);
  for (const room of rooms) {
    const roomRecord = job.rooms.find((item) => item.id === room.roomId);
    const dash = room.provenance === "confirmed" ? "" : room.provenance === "user_corrected" ? `stroke-dasharray="0.15 0.12"` : `stroke-dasharray="0.35 0.2"`;
    parts.push(`<polygon points="${room.polygon.map((point) => `${point.x},${point.y}`).join(" ")}" fill="#f0efeb" stroke="#18191b" stroke-width="0.06" ${dash}/>`);
    const label = centroid(room);
    parts.push(`<text x="${label.x}" y="${label.y}" font-size="0.45" text-anchor="middle" fill="#18191b">${escapeXml(roomRecord?.name ?? "Room")}</text>`);
    room.polygon.forEach((point, index) => {
      const next = room.polygon[(index + 1) % room.polygon.length];
      const dim = job.sketch.geometry.dimensions.find((item) => item.target.type === "edge" && item.target.roomId === room.roomId && item.target.edgeIndex === index);
      const mid = { x: (point.x + next.x) / 2, y: (point.y + next.y) / 2 };
      const shown = dim?.valueFt ?? edgeLength(room.polygon, index);
      parts.push(`<text x="${mid.x}" y="${mid.y - 0.15}" font-size="0.32" text-anchor="middle" fill="#5d5f5e">${shown == null ? "—" : shown.toFixed(2)} ft</text>`);
    });
  }
  for (const opening of job.sketch.geometry.openings) {
    const room = rooms.find((item) => item.roomId === opening.roomId);
    if (!room) continue;
    const a = room.polygon[opening.edgeIndex % room.polygon.length];
    const b = room.polygon[(opening.edgeIndex + 1) % room.polygon.length];
    parts.push(`<line x1="${a.x}" y1="${a.y}" x2="${b.x}" y2="${b.y}" stroke="#18191b" stroke-width="0.12" stroke-dasharray="${opening.connectionStatus === "confirmed" ? "0" : "0.2 0.12"}"/>`);
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
  const version = job.estimates.find((item) => item.id === job.activeEstimateId) ?? job.estimates.at(-1) ?? null;
  const lines = job.scopeItems.map((item) => {
    const priced = version?.pricedLines.find((line) => line.scopeItemId === item.id);
    const room = job.rooms.find((entry) => entry.id === item.roomId)?.name ?? item.location;
    const amount = priced?.extendedPrice ?? null;
    return {
      room,
      description: item.description,
      quantity: item.quantity.value,
      unit: item.quantity.unit,
      amount: priced?.unpricedReason ? null : amount,
    };
  });
  return pitchbookPdf({
    property: [job.property.address, job.property.city, job.property.region, job.property.postalCode].filter(Boolean).join(", "),
    jobNumber: job.id,
    date: formatDate(job.updatedAt),
    preparedBy: version?.createdBy.name || "Atmosphere Scope",
    status: version ? bannerFor(version) : "Draft",
    lines,
    totals: version
      ? [
          { label: "Mitigation", amount: version.totals.mitigationSubtotal },
          { label: "Rebuild", amount: version.totals.rebuildSubtotal },
          { label: "Tax", amount: version.totals.tax },
          { label: "Conditional", amount: version.totals.conditionalAllowance },
          { label: "Optional", amount: version.totals.optionalAllowance },
          { label: "Total", amount: lines.some((line) => line.amount != null) ? version.totals.supportedTotal : null, grand: true },
        ]
      : [{ label: "Total", amount: null, grand: true }],
    footnote: [bannerFor(version), job.sketch.disclaimer].filter(Boolean).join(" "),
  });
}
