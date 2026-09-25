import type { FloorPlan } from "@/domain/plan-from-measurement";
import { frameTimeMs, type IdentifiedObject } from "@/analysis/frames";

export type InventoryLine = {
  name: string;
  room: string | null;
  count: number | null;
  quantity: number | null;
  unit: "each" | "sqft" | "lf";
  source: "vision" | "sketch";
  evidence: string;
  links: { frame: string; timeMs: number | null }[];
  note: string;
};

const SURFACES = {
  floor_area: "Flooring",
  baseboard: "Baseboard",
  wall_area: "Drywall",
} as const;

export function inventoryFromWalkthrough(objects: IdentifiedObject[], plan: FloorPlan | null): InventoryLine[] {
  const surfaces: InventoryLine[] = (plan?.quantities ?? []).map((item) => ({
    name: SURFACES[item.kind],
    room: item.roomName,
    count: null,
    quantity: item.value,
    unit: item.unit,
    source: "sketch",
    evidence: "Sketch",
    links: [],
    note: item.value == null ? item.note : `${item.note} ${item.status === "confirmed" ? "Confirmed." : "Estimated, not confirmed."}`,
  }));
  const seen = objects.map((object) => {
    const cabinet = /cabinet/i.test(object.name);
    return {
      name: object.name,
      room: object.room,
      count: 1,
      quantity: cabinet ? null : 1,
      unit: cabinet ? "lf" as const : "each" as const,
      source: "vision" as const,
      evidence: object.evidence,
      links: object.links?.length ? object.links : object.frames.map((frame) => ({ frame, timeMs: frameTimeMs(frame) })),
      note: cabinet
        ? "A cabinet was seen once across frames. Its length was not measured on the sketch, so no linear feet were invented."
        : "Counted once after cross-frame dedupe. Vision did not measure it.",
    };
  });
  return [...surfaces, ...seen];
}
