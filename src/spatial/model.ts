import type { Job, Point, QuantityStatus } from "@/domain/types";

/** Display-only extrusion when no height was captured. Never stored as a measurement. */
export const SCHEMATIC_HEIGHT_FT = 8;

export type HeightVisual = "confirmed" | "provisional" | "assumed_schematic";

export type SpaceMarker = {
  id: string;
  roomId: string;
  label: string;
  kind: "damage" | "fixture" | "opening" | "uncertainty";
  at: { x: number; y: number; z: number };
  evidenceClass?: string;
};

export type SpaceRoom = {
  roomId: string;
  name: string;
  polygon: Point[];
  heightFt: number;
  heightVisual: HeightVisual;
  heightNote: string;
  provenance: string;
  incomplete: boolean;
  floorY: number;
};

export type SpaceModel = {
  rooms: SpaceRoom[];
  markers: SpaceMarker[];
  claim: "schematic" | "partially_measured" | "measurement_confirmed";
  disclaimer: string;
  videoNote: string;
};

export function buildSpaceModel(job: Job): SpaceModel {
  const rooms: SpaceRoom[] = job.sketch.geometry.rooms.map((room) => {
    const record = job.rooms.find((item) => item.id === room.roomId);
    const height = job.sketch.ceilingHeights[room.roomId];
    const known = height?.valueFt != null && height.status !== "unresolved";
    const heightVisual: HeightVisual = !known ? "assumed_schematic" : height?.status === "confirmed" ? "confirmed" : "provisional";
    return {
      roomId: room.roomId,
      name: record?.name ?? "Room",
      polygon: room.polygon.map((point) => ({ ...point })),
      heightFt: known ? height!.valueFt! : SCHEMATIC_HEIGHT_FT,
      heightVisual,
      heightNote: known ? height!.sourceNote : `No ceiling height was measured. Shown at ${SCHEMATIC_HEIGHT_FT} ft for viewing only.`,
      provenance: room.provenance,
      incomplete: room.incomplete,
      floorY: 0,
    };
  });

  const markers: SpaceMarker[] = [];
  for (const room of rooms) {
    const center = centroid(room.polygon);
    if (room.incomplete || room.heightVisual === "assumed_schematic") {
      markers.push({
        id: `unc_${room.roomId}`,
        roomId: room.roomId,
        label: room.heightVisual === "assumed_schematic" ? "Height not measured" : "Outline incomplete",
        kind: "uncertainty",
        at: { x: center.x, y: room.heightFt, z: center.y },
      });
    }
  }
  for (const finding of job.findings) {
    if (!finding.roomId) continue;
    const room = rooms.find((item) => item.roomId === finding.roomId);
    if (!room) continue;
    if (!["observed_condition", "contradiction", "insufficient_evidence", "no_visible_issue"].includes(finding.evidenceClass)) continue;
    const center = centroid(room.polygon);
    markers.push({
      id: finding.id,
      roomId: finding.roomId,
      label: finding.title,
      kind: finding.evidenceClass === "no_visible_issue" ? "uncertainty" : "damage",
      evidenceClass: finding.evidenceClass,
      at: { x: center.x, y: Math.min(room.heightFt * 0.65, room.heightFt), z: center.y },
    });
  }
  for (const opening of job.sketch.geometry.openings) {
    const room = rooms.find((item) => item.roomId === opening.roomId);
    if (!room) continue;
    const edge = room.polygon[opening.edgeIndex % room.polygon.length];
    const next = room.polygon[(opening.edgeIndex + 1) % room.polygon.length];
    if (!edge || !next) continue;
    markers.push({
      id: opening.id,
      roomId: opening.roomId,
      label: `${opening.kind} · ${opening.connectionStatus}`,
      kind: "opening",
      at: { x: (edge.x + next.x) / 2, y: 0, z: (edge.y + next.y) / 2 },
    });
  }

  const claim = job.sketch.state === "measurement_confirmed" ? "measurement_confirmed" : job.sketch.state === "partially_measured" ? "partially_measured" : "schematic";
  return {
    rooms,
    markers,
    claim,
    disclaimer:
      claim === "measurement_confirmed"
        ? "3D volumes use locked room measurements. This is still not a certified survey."
        : "Suggested 3D schematic extruded from the analyzed sketch. Video was not reconstructed into a measured mesh. Unmeasured heights are a viewing aid only.",
    videoNote: "Room placement comes from narration and frame notes, then from any dimensions you lock. It is not photogrammetry or SLAM.",
  };
}

export function assumedHeightsAreLabeled(model: SpaceModel): boolean {
  return model.rooms.filter((room) => room.heightVisual === "assumed_schematic").every((room) => /viewing only|not measured/i.test(room.heightNote));
}

function centroid(points: Point[]): Point {
  if (points.length === 0) return { x: 0, y: 0 };
  return {
    x: points.reduce((sum, point) => sum + point.x, 0) / points.length,
    y: points.reduce((sum, point) => sum + point.y, 0) / points.length,
  };
}

export function heightStatusLabel(status: QuantityStatus | HeightVisual): string {
  if (status === "assumed_schematic") return "viewing aid — not a measurement";
  if (status === "confirmed") return "confirmed height";
  if (status === "provisional") return "provisional height";
  return "unresolved";
}
