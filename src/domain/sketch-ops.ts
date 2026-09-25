import { createId } from "./ids";
import { applyEvaluation, cloneSnapshot, dimensionForEdge, setEdgeLength, splitRectangle, syncDimensionConflicts, translatePolygon, rotatePolygon, rectangle } from "./geometry";
import type { Job, PendingQuantityChange, Point, ScopeItem, SketchDocument, SketchFixture, SketchOpening, SketchRoom } from "./types";
import { floorArea, wallFaceArea } from "./quantities";
import { quantitySignature } from "./pricing";

export type SketchOp =
  | { type: "add_room"; roomId: string; polygon: Point[]; provenance?: SketchRoom["provenance"] }
  | { type: "move_room"; roomId: string; dx: number; dy: number }
  | { type: "set_edge"; roomId: string; edgeIndex: number; lengthFt: number; lock: boolean; sourceNote: string }
  | { type: "rotate_room"; roomId: string; degrees: number }
  | { type: "split_room"; roomId: string; newRoomId: string; along: "x" | "y"; ratio: number }
  | { type: "connect"; openingId: string; fromRoomId: string; toRoomId: string | null; status: SketchOpening["connectionStatus"] }
  | { type: "add_opening"; opening: SketchOpening }
  | { type: "add_fixture"; fixture: SketchFixture }
  | { type: "annotate"; roomId: string | null; findingId: string | null; text: string; at: Point }
  | { type: "set_height"; roomId: string; valueFt: number | null; lock: boolean; sourceNote: string }
  | { type: "rename_geometry"; roomId: string; incomplete?: boolean; incompleteReason?: string };

function pushHistory(sketch: SketchDocument): SketchDocument {
  return { ...sketch, undo: [...sketch.undo, cloneSnapshot(sketch.geometry)].slice(-50), redo: [] };
}

export function applySketchOp(sketch: SketchDocument, op: SketchOp): SketchDocument {
  const next = pushHistory(sketch);
  const geometry = cloneSnapshot(next.geometry);
  if (op.type === "add_room") {
    geometry.rooms.push({
      id: createId("sroom"),
      roomId: op.roomId,
      polygon: op.polygon,
      provenance: op.provenance ?? "user_corrected",
      incomplete: false,
    });
  }
  if (op.type === "move_room") {
    geometry.rooms = geometry.rooms.map((room) =>
      room.roomId === op.roomId ? { ...room, polygon: translatePolygon(room.polygon, op.dx, op.dy), provenance: room.provenance === "inferred" ? "user_corrected" : room.provenance } : room,
    );
    geometry.fixtures = geometry.fixtures.map((fixture) =>
      fixture.roomId === op.roomId ? { ...fixture, at: { x: fixture.at.x + op.dx, y: fixture.at.y + op.dy } } : fixture,
    );
  }
  if (op.type === "rotate_room") {
    geometry.rooms = geometry.rooms.map((room) =>
      room.roomId === op.roomId ? { ...room, polygon: rotatePolygon(room.polygon, op.degrees), provenance: "user_corrected" } : room,
    );
  }
  if (op.type === "set_edge") {
    geometry.rooms = geometry.rooms.map((room) => {
      if (room.roomId !== op.roomId) return room;
      return { ...room, polygon: setEdgeLength(room.polygon, op.edgeIndex, op.lengthFt), provenance: op.lock ? "confirmed" : "user_corrected" };
    });
    const existing = dimensionForEdge(geometry.dimensions, op.roomId, op.edgeIndex);
    const dim = {
      id: existing?.id ?? createId("dim"),
      target: { type: "edge" as const, roomId: op.roomId, edgeIndex: op.edgeIndex },
      valueFt: op.lengthFt,
      status: op.lock ? ("confirmed" as const) : ("inferred" as const),
      locked: op.lock,
      provenance: op.lock ? ("confirmed" as const) : ("user_corrected" as const),
      sourceNote: op.sourceNote,
    };
    geometry.dimensions = existing
      ? geometry.dimensions.map((item) => (item.id === existing.id ? dim : item))
      : [...geometry.dimensions, dim];
    const room = geometry.rooms.find((item) => item.roomId === op.roomId);
    if (room) geometry.dimensions = syncDimensionConflicts(room, geometry.dimensions);
  }
  if (op.type === "split_room") {
    const room = geometry.rooms.find((item) => item.roomId === op.roomId);
    if (room) {
      const parts = splitRectangle(room.polygon, op.along, op.ratio);
      if (parts) {
        geometry.rooms = geometry.rooms.map((item) => (item.roomId === op.roomId ? { ...item, polygon: parts[0], provenance: "user_corrected" } : item));
        geometry.rooms.push({ id: createId("sroom"), roomId: op.newRoomId, polygon: parts[1], provenance: "user_corrected", incomplete: false });
      }
    }
  }
  if (op.type === "add_opening") geometry.openings.push(op.opening);
  if (op.type === "connect") {
    geometry.openings = geometry.openings.map((opening) =>
      opening.id === op.openingId ? { ...opening, connectsToRoomId: op.toRoomId, connectionStatus: op.status, provenance: op.status === "confirmed" ? "confirmed" : opening.provenance } : opening,
    );
  }
  if (op.type === "add_fixture") geometry.fixtures.push(op.fixture);
  if (op.type === "annotate") {
    geometry.annotations.push({ id: createId("ann"), roomId: op.roomId, findingId: op.findingId, text: op.text, at: op.at, provenance: "user_corrected" });
  }
  if (op.type === "rename_geometry") {
    geometry.rooms = geometry.rooms.map((room) =>
      room.roomId === op.roomId ? { ...room, incomplete: op.incomplete ?? room.incomplete, incompleteReason: op.incompleteReason ?? room.incompleteReason } : room,
    );
  }
  let ceilingHeights = next.ceilingHeights;
  if (op.type === "set_height") {
    ceilingHeights = {
      ...ceilingHeights,
      [op.roomId]: {
        valueFt: op.valueFt,
        status: op.valueFt == null ? "unresolved" : op.lock ? "confirmed" : "provisional",
        provenance: op.lock ? "confirmed" : "user_corrected",
        sourceNote: op.sourceNote,
      },
    };
  }
  return applyEvaluation({ ...next, geometry, ceilingHeights });
}

export function undoSketch(sketch: SketchDocument): SketchDocument {
  const previous = sketch.undo.at(-1);
  if (!previous) return sketch;
  return applyEvaluation({
    ...sketch,
    geometry: cloneSnapshot(previous),
    undo: sketch.undo.slice(0, -1),
    redo: [...sketch.redo, cloneSnapshot(sketch.geometry)],
  });
}

export function redoSketch(sketch: SketchDocument): SketchDocument {
  const next = sketch.redo.at(-1);
  if (!next) return sketch;
  return applyEvaluation({
    ...sketch,
    geometry: cloneSnapshot(next),
    redo: sketch.redo.slice(0, -1),
    undo: [...sketch.undo, cloneSnapshot(sketch.geometry)],
  });
}

export function previewQuantityChanges(job: Job): PendingQuantityChange[] {
  const changes: PendingQuantityChange[] = [];
  for (const item of job.scopeItems) {
    if (!item.roomId || item.humanEdited) continue;
    const proposed = recomputeQuantity(job, item);
    if (!proposed) continue;
    if (quantitySignature(proposed) !== quantitySignature(item.quantity)) {
      changes.push({
        scopeItemId: item.id,
        previous: item.quantity,
        proposed,
        reason: "Sketch geometry changed. Review this quantity before it is applied.",
      });
    }
  }
  return changes;
}

function recomputeQuantity(job: Job, item: ScopeItem) {
  const room = job.sketch.geometry.rooms.find((entry) => entry.roomId === item.roomId);
  if (!room) return null;
  if (item.quantity.formula?.includes("shoelace")) return floorArea(room);
  if (item.quantity.unit === "sqft" && /floor|protection|extract|dry|affected area|removed area|repaired area|paint|drywall|removal/i.test(item.description + item.quantity.sourceNote)) {
    if (/affected area|not the whole room|removed area/i.test(item.quantity.sourceNote)) return item.quantity;
    return floorArea(room);
  }
  if (item.quantity.unit === "sqft" && item.quantity.geometryRefs.length) {
    const height = job.sketch.ceilingHeights[room.roomId];
    return wallFaceArea(room, 0, height?.valueFt ?? null, height?.status ?? "unresolved", job.sketch.geometry.openings, {
      deductOpenings: true,
      wasteFactor: job.estimates.at(-1)?.settings.wasteFactor ?? 0,
    });
  }
  return null;
}

export function rectangleRoom(x: number, y: number, w: number, h: number): Point[] {
  return rectangle(x, y, w, h);
}
