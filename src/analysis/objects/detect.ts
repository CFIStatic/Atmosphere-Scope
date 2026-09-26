import type { BoundingBox, DamageSeverity, DamageType, ObjectCategory, ObjectCondition } from "@/domain/types";

/** Crop address. Row 0 is the top. Coordinates inside a detection are relative to this crop. */
export type TileRef = { row: number; col: number; rows: number; cols: number };

/** Triage call before a strong model confirms it. `possibly_damaged` is not a line by itself. */
export type PreliminaryCondition = "ok" | "possibly_damaged" | "unclear";

/**
 * One model sighting, before cross-frame dedupe.
 * Adapted from Atmosphere's frame observation regions
 * (`backend/src/verification/ai/analyzer.ts`) onto Scope's object list.
 */
export type RawDetection = {
  mediaId: string;
  frameId: string;
  timeMs: number;
  roomHint: string | null;
  tile: TileRef | null;
  category: ObjectCategory;
  label: string;
  material: string | null;
  box: BoundingBox;
  confidence: number;
  condition: ObjectCondition | null;
  damageTypes: DamageType[];
  severity: DamageSeverity | null;
  rationale: string | null;
  /** Set on the triage pass. Absent when the strong model inventoried the frame itself. */
  preliminary?: PreliminaryCondition | null;
  /** Model id that last assessed this sighting. */
  assessedBy?: string | null;
  /** True when a strong-model confirmation should drive condition, not the triage guess. */
  confirmed?: boolean;
};

export const OBJECT_CATEGORIES: ObjectCategory[] = [
  "drywall", "ceiling", "baseboard", "trim", "casing", "door", "window", "flooring",
  "cabinet", "countertop", "fixture", "outlet", "switch", "vent", "light", "hvac",
  "plumbing", "appliance", "contents", "furniture", "other",
];

export const DAMAGE_TYPES: DamageType[] = [
  "water_staining", "swelling", "delamination", "mold", "cracking", "burn", "smoke", "missing", "wet",
];

export function clamp01(value: number): number {
  if (!Number.isFinite(value)) return 0;
  return Math.min(1, Math.max(0, value));
}

export function clampBox(box: BoundingBox): BoundingBox {
  const x = clamp01(box.x);
  const y = clamp01(box.y);
  const width = Math.min(1 - x, Math.max(0, box.width));
  const height = Math.min(1 - y, Math.max(0, box.height));
  return { x, y, width, height };
}

/** Map a crop-relative box onto the full frame. */
export function tileToFrame(box: BoundingBox, tile: TileRef | null): BoundingBox {
  if (!tile || tile.rows < 1 || tile.cols < 1) return clampBox(box);
  return clampBox({
    x: (tile.col + box.x) / tile.cols,
    y: (tile.row + box.y) / tile.rows,
    width: box.width / tile.cols,
    height: box.height / tile.rows,
  });
}

export function boxCenter(box: BoundingBox): { x: number; y: number } {
  return { x: box.x + box.width / 2, y: box.y + box.height / 2 };
}

export function centerDistance(left: BoundingBox, right: BoundingBox): number {
  const a = boxCenter(left);
  const b = boxCenter(right);
  return Math.hypot(a.x - b.x, a.y - b.y);
}

/** FNV-1a. Stable across runs so the same object keeps the same id. */
export function stableObjectId(parts: string[]): string {
  let hash = 2166136261;
  const text = parts.join("|").toLowerCase().replace(/\s+/g, " ").trim();
  for (let i = 0; i < text.length; i += 1) {
    hash ^= text.charCodeAt(i);
    hash = Math.imul(hash, 16777619);
  }
  return `obj_${(hash >>> 0).toString(16).padStart(8, "0")}`;
}

export function normRoom(value: string | null | undefined): string {
  const text = (value ?? "").trim().replace(/\s+/g, " ");
  if (!text) return "Unassigned";
  return text.replace(/\b\w/g, (letter) => letter.toUpperCase());
}

export function normLabel(value: string): string {
  return value.trim().toLowerCase().replace(/[.\s]+$/g, "").replace(/\s+/g, " ");
}
