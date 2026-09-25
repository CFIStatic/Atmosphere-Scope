import { createId } from "@/domain/ids";
import { applyEvaluation, edgeLength } from "@/domain/geometry";
import type { Job, Point, Room } from "@/domain/types";

export type DepthPayload = {
  format: "atmosphere-depth-v1";
  rooms: {
    name: string;
    floor?: string;
    polygonFt: Point[];
    heightFt?: number | null;
  }[];
};

export function isDepthPayload(value: unknown): value is DepthPayload {
  if (!value || typeof value !== "object") return false;
  const record = value as DepthPayload;
  return record.format === "atmosphere-depth-v1" && Array.isArray(record.rooms);
}

/** LiDAR-style import. Geometry stays unconfirmed until a reviewer locks each dimension. */
export function importDepthPayload(job: Job, payload: DepthPayload): Job {
  const floors = [...job.floors];
  const rooms: Room[] = [...job.rooms];
  const geometryRooms = [...job.sketch.geometry.rooms];
  const dimensions = [...job.sketch.geometry.dimensions];
  const ceilingHeights = { ...job.sketch.ceilingHeights };

  for (const incoming of payload.rooms) {
    if (!incoming.name || incoming.polygonFt.length < 3) continue;
    const floorName = incoming.floor ?? "Main floor";
    let floor = floors.find((item) => item.name === floorName);
    if (!floor) {
      floor = { id: createId("flr"), name: floorName, level: floors.length };
      floors.push(floor);
    }
    let room = rooms.find((item) => item.name.toLowerCase() === incoming.name.toLowerCase());
    if (!room) {
      room = { id: createId("room"), floorId: floor.id, name: incoming.name, nameStatus: "inferred", humanNamed: false, notes: "Imported from depth. Not a confirmed survey." };
      rooms.push(room);
    }
    if (geometryRooms.some((item) => item.roomId === room!.id)) continue;
    geometryRooms.push({
      id: createId("sroom"),
      roomId: room.id,
      polygon: incoming.polygonFt.map((point) => ({ x: point.x, y: point.y })),
      provenance: "imported",
      incomplete: false,
    });
    incoming.polygonFt.forEach((_, index) => {
      dimensions.push({
        id: createId("dim"),
        target: { type: "edge", roomId: room!.id, edgeIndex: index },
        valueFt: Math.round(edgeLength(incoming.polygonFt, index) * 100) / 100,
        status: "inferred",
        locked: false,
        provenance: "imported",
        sourceNote: "Depth import. Not locked until a reviewer accepts it.",
      });
    });
    ceilingHeights[room.id] = incoming.heightFt
      ? { valueFt: incoming.heightFt, status: "provisional", provenance: "imported", sourceNote: "Height came from the depth file and still needs acceptance." }
      : { valueFt: null, status: "unresolved", provenance: "imported", sourceNote: "Depth file did not include a ceiling height." };
  }

  const sketch = applyEvaluation({ ...job.sketch, ceilingHeights, geometry: { ...job.sketch.geometry, rooms: geometryRooms, dimensions } });
  return {
    ...job,
    floors,
    rooms,
    sketch,
    audit: [...job.audit, { id: createId("aud"), at: new Date().toISOString(), actor: { name: "Depth import", role: "system" }, action: "depth_import", detail: "Depth geometry stored as inferred. It was not marked measurement-confirmed." }],
  };
}
