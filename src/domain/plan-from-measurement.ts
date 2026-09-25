import { edgeLength, polygonArea, rectangle, setEdgeLength } from "./geometry";
import type { Point, ProvenanceKind, QuantityStatus, SketchAnnotation, SketchDimension, SketchOpening, SketchRoom } from "./types";

export type MeasuredDimension = {
  id?: string;
  kind: string;
  label: string;
  valueFt: number | null;
  errorPercent?: number | null;
  meetsAccuracyTarget?: boolean;
  confirmed?: boolean;
  sources?: string[];
  note?: string;
  importedFrom?: string;
};

export type ImportedQuantities = {
  from: string;
  floorSqft?: number | null;
  perimeterLf?: number | null;
  wallSqft?: number | null;
};

export type MeasuredOpening = {
  kind: "door" | "window";
  edgeIndex: number;
  widthFt: number | null;
  offsetFt?: number;
  connectsToRoomId?: string | null;
};

export type PlanMarker = {
  kind: "moisture" | "question";
  text: string;
  at?: Point;
};

export type MeasuredRoomInput = {
  id: string;
  name: string;
  polygonFt?: Point[] | null;
  dimensions: MeasuredDimension[];
  openings?: MeasuredOpening[];
  markers?: PlanMarker[];
  importedQuantities?: ImportedQuantities;
};

export type PlanEdge = {
  roomId: string;
  edgeIndex: number;
  valueFt: number | null;
  status: "confirmed" | "estimated" | "imported" | "unmeasured";
  stroke: "solid" | "dashed";
  label: string;
};

export type PlanQuantity = {
  roomId: string;
  roomName: string;
  kind: "floor_area" | "baseboard" | "wall_area";
  label: string;
  value: number | null;
  unit: "sqft" | "lf";
  status: "confirmed" | "estimated" | "imported" | "unmeasured";
  note: string;
};

export type FloorPlan = {
  rooms: SketchRoom[];
  openings: SketchOpening[];
  annotations: SketchAnnotation[];
  dimensions: SketchDimension[];
  ceilingHeights: Record<string, { valueFt: number | null; status: QuantityStatus; provenance: ProvenanceKind; sourceNote: string }>;
  edges: PlanEdge[];
  quantities: PlanQuantity[];
  names: Record<string, string>;
  overrides: Record<string, ImportedQuantities>;
  disclaimer: string;
};

const DISCLAIMER = "Walls with a measured length are drawn solid. Unmeasured walls are dashed. Estimated is not confirmed. A tape or laser lock is the only confirmation. Nothing was filled in.";

export const recordedSyntheticRoom: MeasuredRoomInput = {
  id: "synthetic-rect",
  name: "Synthetic room",
  dimensions: [
    { kind: "wall_length", label: "span_a", valueFt: 11.981, errorPercent: 2.6, meetsAccuracyTarget: true, confirmed: false, note: "Sheet solve on the synthetic harness. Not a tape." },
    { kind: "wall_length", label: "span_b", valueFt: 13.913, errorPercent: 2.6, meetsAccuracyTarget: true, confirmed: false, note: "Sheet solve on the synthetic harness. Not a tape." },
    { kind: "ceiling_height", label: "height", valueFt: 7.987, errorPercent: 3.26, meetsAccuracyTarget: true, confirmed: false, note: "Estimated ceiling from the synthetic harness. Not confirmed." },
  ],
};

export function floorPlanFromMeasurement(inputs: MeasuredRoomInput[], note?: string): FloorPlan {
  const placed = placeRooms(inputs);
  const rooms: SketchRoom[] = [];
  const openings: SketchOpening[] = [];
  const annotations: SketchAnnotation[] = [];
  const dimensions: SketchDimension[] = [];
  const ceilingHeights: FloorPlan["ceilingHeights"] = {};
  const names: Record<string, string> = {};

  for (const room of placed) {
    names[room.id] = room.name;
    const walls = wallSpans(room.dimensions);
    const height = room.dimensions.find((item) => item.kind === "ceiling_height") ?? null;
    const polygon = room.polygon.length >= 3 ? room.polygon : placeholderPolygon(room.origin);
    const measuredWalls = walls.filter((item) => item.valueFt != null).length;
    const incomplete = measuredWalls < 2 || polygon.length < 3;
    rooms.push({
      id: `sroom_${room.id}`,
      roomId: room.id,
      polygon,
      provenance: "inferred",
      incomplete,
      incompleteReason: incomplete ? "At least two wall spans are required before the outline is measured." : undefined,
    });
    assignWalls(room.id, polygon, walls, dimensions);
    ceilingHeights[room.id] = heightRecord(height);
    for (const opening of room.openings) {
      openings.push({
        id: `opn_${room.id}_${opening.edgeIndex}_${opening.kind}`,
        roomId: room.id,
        edgeIndex: opening.edgeIndex,
        kind: opening.kind,
        offsetFt: opening.offsetFt ?? 0,
        widthFt: opening.widthFt,
        heightFt: null,
        connectsToRoomId: opening.connectsToRoomId ?? null,
        connectionStatus: opening.connectsToRoomId ? "inferred" : opening.kind === "door" ? "unresolved" : "none",
        provenance: "inferred",
      });
    }
    const host = polygon;
    const center = centroid(host);
    room.markers.forEach((marker, index) => {
      annotations.push({
        id: `ann_${room.id}_${index}`,
        roomId: room.id,
        findingId: null,
        text: marker.kind === "moisture" ? `Moisture: ${marker.text}` : `Open question: ${marker.text}`,
        at: marker.at ?? { x: center.x, y: center.y + index * 0.6 },
        provenance: marker.at ? "inferred" : "inferred",
      });
    });
  }

  const plan: FloorPlan = {
    rooms,
    openings,
    annotations,
    dimensions,
    ceilingHeights,
    edges: [],
    quantities: [],
    names,
    overrides: Object.fromEntries(placed.filter((room) => room.importedQuantities).map((room) => [room.id, room.importedQuantities!])),
    disclaimer: note ? `${note} ${DISCLAIMER}` : DISCLAIMER,
  };
  return refresh(plan);
}

export function correctPlanEdge(plan: FloorPlan, roomId: string, edgeIndex: number, lengthFt: number, lock: boolean): FloorPlan {
  if (!Number.isFinite(lengthFt) || lengthFt <= 0) return plan;
  const rooms = plan.rooms.map((room) => {
    if (room.roomId !== roomId) return room;
    return { ...room, polygon: setEdgeLength(room.polygon, edgeIndex, lengthFt), provenance: lock ? "confirmed" as const : "user_corrected" as const, incomplete: false, incompleteReason: undefined };
  });
  const dimensions = plan.dimensions.map((dimension) => ({ ...dimension, target: { ...dimension.target } }));
  const edited = dimensions.find((dimension) => dimension.target.type === "edge" && dimension.target.roomId === roomId && dimension.target.edgeIndex === edgeIndex);
  const nextEdited: SketchDimension = {
    id: edited?.id ?? `dim_${roomId}_${edgeIndex}`,
    target: { type: "edge", roomId, edgeIndex },
    valueFt: round3(lengthFt),
    status: lock ? "confirmed" : "inferred",
    locked: lock,
    provenance: lock ? "confirmed" : "user_corrected",
    sourceNote: lock ? "Locked by a user measurement." : "User correction. Still estimated until it is locked.",
  };
  const replaced = edited ? dimensions.map((dimension) => (dimension.id === edited.id ? nextEdited : dimension)) : [...dimensions, nextEdited];
  const room = rooms.find((item) => item.roomId === roomId);
  const synced = room ? syncUnlockedEdges(room, replaced) : replaced;
  return refresh({ ...plan, rooms, dimensions: synced });
}

export function correctPlanHeight(plan: FloorPlan, roomId: string, lengthFt: number | null, lock: boolean): FloorPlan {
  const ceilingHeights = { ...plan.ceilingHeights };
  if (lengthFt == null || !Number.isFinite(lengthFt) || lengthFt <= 0) {
    ceilingHeights[roomId] = { valueFt: null, status: "unresolved", provenance: "user_corrected", sourceNote: "Height was cleared. It was not guessed." };
  } else {
    ceilingHeights[roomId] = {
      valueFt: round3(lengthFt),
      status: lock ? "confirmed" : "provisional",
      provenance: lock ? "confirmed" : "user_corrected",
      sourceNote: lock ? "Locked by a user measurement." : "User correction. Still estimated until it is locked.",
    };
  }
  return refresh({ ...plan, ceilingHeights });
}

function refresh(plan: FloorPlan): FloorPlan {
  const edges = plan.rooms.flatMap((room) => edgesFor(room, plan.dimensions));
  const quantities = plan.rooms.flatMap((room) => quantitiesFor(room, plan));
  return { ...plan, edges, quantities };
}

function edgesFor(room: SketchRoom, dimensions: SketchDimension[]): PlanEdge[] {
  return room.polygon.map((_, edgeIndex) => {
    const dimension = dimensions.find((item) => item.target.type === "edge" && item.target.roomId === room.roomId && item.target.edgeIndex === edgeIndex);
    const value = dimension?.valueFt ?? null;
    if (value == null || dimension?.status === "unresolved") {
      return { roomId: room.roomId, edgeIndex, valueFt: null, status: "unmeasured", stroke: "dashed", label: "— unmeasured" };
    }
    if (dimension?.status === "confirmed" && dimension.locked) {
      return { roomId: room.roomId, edgeIndex, valueFt: value, status: "confirmed", stroke: "solid", label: `${value} ft confirmed` };
    }
    if (dimension?.provenance === "imported") {
      return { roomId: room.roomId, edgeIndex, valueFt: value, status: "imported", stroke: "solid", label: `${value} ft imported` };
    }
    return { roomId: room.roomId, edgeIndex, valueFt: value, status: "estimated", stroke: "solid", label: `${value} ft estimated` };
  });
}

function quantitiesFor(room: SketchRoom, plan: FloorPlan): PlanQuantity[] {
  const name = plan.names[room.roomId] ?? room.roomId;
  const edges = edgesFor(room, plan.dimensions);
  const height = plan.ceilingHeights[room.roomId];
  const measured = edges.filter((edge) => edge.valueFt != null);
  const allConfirmed = edges.length > 0 && edges.every((edge) => edge.status === "confirmed");
  const allImported = edges.length > 0 && edges.every((edge) => edge.status === "imported");
  const override = plan.overrides[room.roomId];
  const drawn = room.incomplete || measured.length < edges.length ? "unmeasured" : allConfirmed ? "confirmed" : allImported ? "imported" : "estimated";
  const floorStatus = drawn === "unmeasured" && override?.floorSqft != null ? "imported" : drawn;
  const area = drawn !== "unmeasured" ? round3(polygonArea(room.polygon)) : override?.floorSqft != null ? round3(override.floorSqft) : null;
  const perimeter = drawn !== "unmeasured" ? round3(edges.reduce((sum, edge) => sum + (edge.valueFt ?? 0), 0)) : override?.perimeterLf != null ? round3(override.perimeterLf) : null;
  const heightKnown = height?.valueFt != null && height.status !== "unresolved";
  const wall = override?.wallSqft != null && drawn === "unmeasured" ? round3(override.wallSqft) : floorStatus === "unmeasured" || !heightKnown ? null : round3((perimeter ?? 0) * (height?.valueFt ?? 0));
  const wallStatus = wall == null ? "unmeasured" : allConfirmed && height?.status === "confirmed" ? "confirmed" : allImported || override?.wallSqft != null || height?.provenance === "imported" ? "imported" : "estimated";
  return [
    { roomId: room.roomId, roomName: name, kind: "floor_area", label: "Floor", value: area, unit: "sqft", status: floorStatus, note: quantityNote(floorStatus, override, "Floor area stays blank until every wall has a length.", drawn === "unmeasured" ? "Floor area was imported. Wall lengths were not in the file, so no outline was invented." : "Area follows the wall lengths.") },
    { roomId: room.roomId, roomName: name, kind: "baseboard", label: "Baseboard", value: perimeter, unit: "lf", status: perimeter == null ? "unmeasured" : floorStatus, note: quantityNote(perimeter == null ? "unmeasured" : floorStatus, override, "Baseboard length needs a closed measured outline.", "Linear feet follow the wall lengths or the imported perimeter.") },
    { roomId: room.roomId, roomName: name, kind: "wall_area", label: "Walls / drywall", value: wall, unit: "sqft", status: wallStatus, note: wall == null ? "Wall area needs the outline and a ceiling height. Height was not guessed." : wallStatus === "imported" ? `Imported from ${override?.from ?? "the floor plan file"}. Not a tape confirmation.` : "Gross wall area. Openings were not deducted unless a width and height were measured." },
  ];
}

function syncUnlockedEdges(room: SketchRoom, dimensions: SketchDimension[]): SketchDimension[] {
  return dimensions.map((dimension) => {
    if (dimension.target.type !== "edge" || dimension.target.roomId !== room.roomId || dimension.locked) return dimension;
    const geometric = round3(edgeLength(room.polygon, dimension.target.edgeIndex));
    if (dimension.valueFt == null) return dimension;
    if (Math.abs(geometric - dimension.valueFt) <= 0.05) return dimension;
    return { ...dimension, valueFt: geometric, status: "inferred", sourceNote: "Facing wall moved with the edited wall. It stays estimated." };
  });
}

function assignWalls(roomId: string, polygon: Point[], walls: MeasuredDimension[], dimensions: SketchDimension[]) {
  if (walls.length === polygon.length && walls.every((wall) => wall.label.startsWith("edge_"))) {
    walls.forEach((wall, edgeIndex) => dimensions.push(wallDimension(roomId, edgeIndex, wall)));
    return;
  }
  const uniquePairs = polygon.length === 4 ? [[0, 2], [1, 3]] : polygon.map((_, index) => [index]);
  const ranked = [...walls].sort((a, b) => (a.valueFt ?? 0) - (b.valueFt ?? 0));
  const pairOrder = [...uniquePairs].sort((a, b) => edgeLength(polygon, a[0]) - edgeLength(polygon, b[0]));
  ranked.forEach((wall, index) => {
    const pair = pairOrder[index] ?? [];
    for (const edgeIndex of pair) {
      dimensions.push(wallDimension(roomId, edgeIndex, wall));
    }
  });
  for (let edgeIndex = 0; edgeIndex < polygon.length; edgeIndex += 1) {
    if (dimensions.some((item) => item.target.type === "edge" && item.target.roomId === roomId && item.target.edgeIndex === edgeIndex)) continue;
    dimensions.push({
      id: `dim_${roomId}_${edgeIndex}`,
      target: { type: "edge", roomId, edgeIndex },
      valueFt: null,
      status: "unresolved",
      locked: false,
      provenance: "inferred",
      sourceNote: "This wall was not measured.",
    });
  }
}

function quantityNote(status: PlanQuantity["status"], override: ImportedQuantities | undefined, blank: string, filled: string): string {
  if (status === "unmeasured") return blank;
  if (status === "imported") return `${filled} Source: ${override?.from ?? "imported file"}. Not a tape confirmation.`;
  if (status === "confirmed") return filled;
  return `${filled} Estimated until a tape or laser locks it.`;
}

function wallDimension(roomId: string, edgeIndex: number, wall: MeasuredDimension): SketchDimension {
  if (wall.importedFrom && wall.valueFt != null) {
    return {
      id: `dim_${roomId}_${edgeIndex}`,
      target: { type: "edge", roomId, edgeIndex },
      valueFt: wall.valueFt,
      status: "inferred",
      locked: false,
      provenance: "imported",
      sourceNote: `Imported from ${wall.importedFrom}. Measured by that tool, not confirmed here.`,
    };
  }
  const confirmed = wall.confirmed === true && wall.valueFt != null;
  return {
    id: `dim_${roomId}_${edgeIndex}`,
    target: { type: "edge", roomId, edgeIndex },
    valueFt: wall.valueFt,
    status: wall.valueFt == null ? "unresolved" : confirmed ? "confirmed" : "inferred",
    locked: confirmed,
    provenance: confirmed ? "confirmed" : "inferred",
    sourceNote: wall.note || (confirmed ? "Locked measurement." : "Estimated from the measurement. Not confirmed."),
  };
}

function heightRecord(height: MeasuredDimension | null): FloorPlan["ceilingHeights"][string] {
  if (!height || height.valueFt == null) {
    return { valueFt: null, status: "unresolved", provenance: "inferred", sourceNote: height?.note || "Ceiling height was not measured." };
  }
  if (height.importedFrom) {
    return { valueFt: height.valueFt, status: "provisional", provenance: "imported", sourceNote: `Imported from ${height.importedFrom}. Measured by that tool, not confirmed here.` };
  }
  const confirmed = height.confirmed === true;
  return {
    valueFt: height.valueFt,
    status: confirmed ? "confirmed" : "provisional",
    provenance: confirmed ? "confirmed" : "inferred",
    sourceNote: height.note || (confirmed ? "Locked ceiling height." : "Estimated ceiling height. Not confirmed."),
  };
}

function wallSpans(dimensions: MeasuredDimension[]): MeasuredDimension[] {
  return dimensions.filter((item) => item.kind === "wall_length" || item.label === "span_a" || item.label === "span_b" || item.label === "width" || item.label === "depth");
}

type Placed = MeasuredRoomInput & { polygon: Point[]; origin: Point; openings: MeasuredOpening[]; markers: PlanMarker[] };

function placeRooms(inputs: MeasuredRoomInput[]): Placed[] {
  let cursor = 0;
  return inputs.map((room) => {
    const spans = wallSpans(room.dimensions).map((item) => item.valueFt).filter((value): value is number => value != null).sort((a, b) => a - b);
    const given = room.polygonFt && room.polygonFt.length >= 3 ? room.polygonFt.map((point) => ({ ...point })) : null;
    const width = spans[0] ?? 10;
    const depth = spans[1] ?? spans[0] ?? 8;
    const polygon = given ?? rectangle(cursor, 0, width, depth);
    if (!given) cursor += width + 2;
    else cursor = Math.max(cursor, ...polygon.map((point) => point.x)) + 2;
    return { ...room, polygon, origin: { x: polygon[0]?.x ?? cursor, y: polygon[0]?.y ?? 0 }, openings: room.openings ?? [], markers: room.markers ?? [] };
  });
}

function placeholderPolygon(origin: Point): Point[] {
  return rectangle(origin.x, origin.y, 10, 8);
}

function centroid(points: Point[]): Point {
  if (!points.length) return { x: 0, y: 0 };
  return { x: points.reduce((sum, point) => sum + point.x, 0) / points.length, y: points.reduce((sum, point) => sum + point.y, 0) / points.length };
}

function round3(value: number): number {
  return Math.round(value * 1000) / 1000;
}
