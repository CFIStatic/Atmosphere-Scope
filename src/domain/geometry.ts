import type { Point, SketchDimension, SketchDocument, SketchOpening, SketchRoom, SketchSnapshot, SketchState, ScaleClaim } from "./types";

export const LENGTH_TOLERANCE_FT = 0.05;

export function distance(a: Point, b: Point): number {
  return Math.hypot(b.x - a.x, b.y - a.y);
}

export function polygonArea(points: Point[]): number {
  if (points.length < 3) return 0;
  let sum = 0;
  for (let i = 0; i < points.length; i += 1) {
    const next = points[(i + 1) % points.length];
    sum += points[i].x * next.y - next.x * points[i].y;
  }
  return Math.abs(sum) / 2;
}

export function perimeter(points: Point[]): number {
  if (points.length < 2) return 0;
  let total = 0;
  for (let i = 0; i < points.length; i += 1) {
    total += distance(points[i], points[(i + 1) % points.length]);
  }
  return total;
}

export function edgeLength(points: Point[], edgeIndex: number): number {
  if (points.length < 2) return 0;
  const a = points[edgeIndex % points.length];
  const b = points[(edgeIndex + 1) % points.length];
  return distance(a, b);
}

export function boundsOf(rooms: SketchRoom[]): { minX: number; minY: number; maxX: number; maxY: number } {
  const pts = rooms.flatMap((r) => r.polygon);
  if (pts.length === 0) return { minX: 0, minY: 0, maxX: 20, maxY: 16 };
  const xs = pts.map((p) => p.x);
  const ys = pts.map((p) => p.y);
  return { minX: Math.min(...xs), minY: Math.min(...ys), maxX: Math.max(...xs), maxY: Math.max(...ys) };
}

export function rectangle(x: number, y: number, w: number, h: number): Point[] {
  return [
    { x, y },
    { x: x + w, y },
    { x: x + w, y: y + h },
    { x, y: y + h },
  ];
}

/** Slide the far vertex of an edge so the edge matches lengthFt. Orthogonal rooms stay orthogonal. */
export function setEdgeLength(polygon: Point[], edgeIndex: number, lengthFt: number): Point[] {
  if (polygon.length < 2 || lengthFt <= 0) return polygon.map((p) => ({ ...p }));
  const next = polygon.map((p) => ({ ...p }));
  const i = edgeIndex % next.length;
  const j = (i + 1) % next.length;
  const a = next[i];
  const b = next[j];
  const len = distance(a, b);
  if (len < 1e-6) return next;
  const ux = (b.x - a.x) / len;
  const uy = (b.y - a.y) / len;
  const delta = lengthFt - len;
  const axisAligned = Math.abs(ux) < 1e-6 || Math.abs(uy) < 1e-6;
  if (axisAligned && next.length === 4) {
    for (let k = 0; k < next.length; k += 1) {
      if (k === i) continue;
      const sharesFarWall =
        (Math.abs(uy) < 1e-6 && Math.abs(next[k].x - b.x) < 1e-6) ||
        (Math.abs(ux) < 1e-6 && Math.abs(next[k].y - b.y) < 1e-6);
      if (k === j || sharesFarWall) {
        next[k] = { x: next[k].x + ux * delta, y: next[k].y + uy * delta };
      }
    }
    return next;
  }
  next[j] = { x: a.x + ux * lengthFt, y: a.y + uy * lengthFt };
  return next;
}

export function translatePolygon(polygon: Point[], dx: number, dy: number): Point[] {
  return polygon.map((p) => ({ x: p.x + dx, y: p.y + dy }));
}

export function rotatePolygon(polygon: Point[], degrees: number): Point[] {
  if (polygon.length === 0) return [];
  const cx = polygon.reduce((s, p) => s + p.x, 0) / polygon.length;
  const cy = polygon.reduce((s, p) => s + p.y, 0) / polygon.length;
  const rad = (degrees * Math.PI) / 180;
  const cos = Math.cos(rad);
  const sin = Math.sin(rad);
  return polygon.map((p) => {
    const x = p.x - cx;
    const y = p.y - cy;
    return { x: cx + x * cos - y * sin, y: cy + x * sin + y * cos };
  });
}

export function splitRectangle(polygon: Point[], along: "x" | "y", ratio: number): [Point[], Point[]] | null {
  if (polygon.length !== 4) return null;
  const box = boundsOf([{ id: "_", roomId: "_", polygon, provenance: "inferred", incomplete: false }]);
  const t = Math.min(0.8, Math.max(0.2, ratio));
  if (along === "x") {
    const cut = box.minX + (box.maxX - box.minX) * t;
    return [
      rectangle(box.minX, box.minY, cut - box.minX, box.maxY - box.minY),
      rectangle(cut, box.minY, box.maxX - cut, box.maxY - box.minY),
    ];
  }
  const cut = box.minY + (box.maxY - box.minY) * t;
  return [
    rectangle(box.minX, box.minY, box.maxX - box.minX, cut - box.minY),
    rectangle(box.minX, cut, box.maxX - box.minX, box.maxY - cut),
  ];
}

export function dimensionForEdge(dimensions: SketchDimension[], roomId: string, edgeIndex: number): SketchDimension | undefined {
  return dimensions.find((d) => d.target.type === "edge" && d.target.roomId === roomId && d.target.edgeIndex === edgeIndex);
}

export function syncDimensionConflicts(room: SketchRoom, dimensions: SketchDimension[]): SketchDimension[] {
  return dimensions.map((d) => {
    if (d.target.type !== "edge" || d.target.roomId !== room.roomId) return d;
    if (d.valueFt == null) return { ...d, status: d.status === "confirmed" ? "unresolved" : d.status };
    const geometric = edgeLength(room.polygon, d.target.edgeIndex);
    const conflict = Math.abs(geometric - d.valueFt) > LENGTH_TOLERANCE_FT;
    if (conflict) return { ...d, status: "conflicting" };
    if (d.locked && d.provenance === "confirmed") return { ...d, status: "confirmed" };
    if (d.locked) return { ...d, status: "confirmed", provenance: "confirmed" };
    return { ...d, status: d.provenance === "confirmed" ? "confirmed" : "inferred" };
  });
}

export type SketchEvaluation = {
  state: SketchState;
  scaleClaim: ScaleClaim;
  scaleClaimReason: string;
  conflicts: string[];
  missing: string[];
};

export function evaluateSketch(
  rooms: SketchRoom[],
  dimensions: SketchDimension[],
  openings: SketchOpening[],
  ceilingHeights: SketchDocument["ceilingHeights"],
): SketchEvaluation {
  const conflicts: string[] = [];
  const missing: string[] = [];
  let confirmedEdges = 0;
  let totalEdges = 0;

  for (const room of rooms) {
    totalEdges += room.polygon.length;
    if (room.incomplete) missing.push(`${room.roomId}: layout incomplete${room.incompleteReason ? ` (${room.incompleteReason})` : ""}`);
    for (let i = 0; i < room.polygon.length; i += 1) {
      const dim = dimensionForEdge(dimensions, room.roomId, i);
      const geometric = edgeLength(room.polygon, i);
      if (!dim || dim.valueFt == null || dim.status === "unresolved") {
        missing.push(`${room.roomId} edge ${i + 1}: length not confirmed`);
        continue;
      }
      if (dim.status === "conflicting" || Math.abs(geometric - dim.valueFt) > LENGTH_TOLERANCE_FT) {
        conflicts.push(`${room.roomId} edge ${i + 1}: recorded ${dim.valueFt} ft vs geometry ${geometric.toFixed(2)} ft`);
        continue;
      }
      if (dim.status === "confirmed" && dim.locked) confirmedEdges += 1;
      else missing.push(`${room.roomId} edge ${i + 1}: length is inferred, not locked`);
    }
    const height = ceilingHeights[room.roomId];
    if (!height || height.valueFt == null || height.status !== "confirmed") {
      missing.push(`${room.roomId}: ceiling height not confirmed`);
    }
  }

  for (const opening of openings) {
    if (opening.kind === "door" && opening.connectionStatus === "unresolved") {
      missing.push(`${opening.id}: doorway connection unresolved`);
    }
    if (opening.kind === "door" && opening.connectionStatus === "inferred") {
      missing.push(`${opening.id}: doorway connection inferred, not confirmed`);
    }
  }

  const anyConfirmed = confirmedEdges > 0 || Object.values(ceilingHeights).some((h) => h.status === "confirmed");
  let state: SketchState = "provisional_layout";
  if (conflicts.length > 0 || (anyConfirmed && missing.length > 0)) state = "partially_measured";
  if (conflicts.length === 0 && missing.length === 0 && rooms.length > 0 && confirmedEdges === totalEdges) {
    state = "measurement_confirmed";
  } else if (anyConfirmed && state === "provisional_layout") state = "partially_measured";

  const scaleClaim: ScaleClaim = state === "measurement_confirmed" ? "to_scale" : "not_to_scale";
  const scaleClaimReason =
    scaleClaim === "to_scale"
      ? "Every room edge and ceiling height is a locked, consistent measurement accepted by the reviewer."
      : confirmedEdges > 0
        ? "Some dimensions are confirmed, but that does not validate the rest of the layout."
        : "Arrangement is inferred. No complete set of locked measurements supports a scale claim.";

  return { state, scaleClaim, scaleClaimReason, conflicts, missing };
}

export function applyEvaluation(sketch: SketchDocument): SketchDocument {
  const evaluation = evaluateSketch(
    sketch.geometry.rooms,
    sketch.geometry.dimensions,
    sketch.geometry.openings,
    sketch.ceilingHeights,
  );
  return { ...sketch, state: evaluation.state, scaleClaim: evaluation.scaleClaim, scaleClaimReason: evaluation.scaleClaimReason };
}

export function cloneSnapshot(snapshot: SketchSnapshot): SketchSnapshot {
  return JSON.parse(JSON.stringify(snapshot)) as SketchSnapshot;
}

export function emptySnapshot(): SketchSnapshot {
  return { rooms: [], openings: [], fixtures: [], annotations: [], dimensions: [] };
}
