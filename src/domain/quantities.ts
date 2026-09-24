import { edgeLength, polygonArea, perimeter } from "./geometry";
import type { Quantity, QuantityStatus, SketchDimension, SketchOpening, SketchRoom } from "./types";

export type EstimatingRules = {
  deductOpenings: boolean;
  wasteFactor: number;
};

export function inchesToFeet(inches: number): number {
  return inches / 12;
}

export function metersToFeet(meters: number): number {
  return meters * 3.280839895;
}

export function roundQty(value: number, digits = 2): number {
  const f = 10 ** digits;
  return Math.round(value * f) / f;
}

function statusFrom(parts: QuantityStatus[]): QuantityStatus {
  if (parts.includes("unresolved")) return "unresolved";
  if (parts.includes("provisional")) return "provisional";
  return "confirmed";
}

export function floorArea(room: SketchRoom): Quantity {
  const value = roundQty(polygonArea(room.polygon));
  const provisional = room.provenance !== "confirmed" && room.provenance !== "user_corrected";
  return {
    value: room.incomplete ? null : value,
    unit: "sqft",
    status: room.incomplete ? "unresolved" : provisional ? "provisional" : "confirmed",
    formula: room.incomplete ? null : "shoelace area of room polygon",
    sourceNote: room.incomplete ? "Room outline is incomplete." : `Geometry provenance: ${room.provenance}.`,
    geometryRefs: [room.id],
  };
}

export function ceilingArea(room: SketchRoom): Quantity {
  const floor = floorArea(room);
  return { ...floor, formula: floor.formula ? "ceiling area equals floor area for a flat ceiling" : null };
}

export function roomPerimeter(room: SketchRoom): Quantity {
  if (room.incomplete) {
    return { value: null, unit: "lf", status: "unresolved", formula: null, sourceNote: "Perimeter needs a closed outline.", geometryRefs: [room.id] };
  }
  return {
    value: roundQty(perimeter(room.polygon)),
    unit: "lf",
    status: room.provenance === "confirmed" || room.provenance === "user_corrected" ? "confirmed" : "provisional",
    formula: "sum of polygon edge lengths",
    sourceNote: `Geometry provenance: ${room.provenance}.`,
    geometryRefs: [room.id],
  };
}

export function wallFaceArea(
  room: SketchRoom,
  edgeIndex: number,
  heightFt: number | null,
  heightStatus: QuantityStatus,
  openings: SketchOpening[],
  rules: EstimatingRules,
  dimension?: SketchDimension,
): Quantity {
  const refs = [room.id];
  if (heightFt == null || heightStatus === "unresolved") {
    return {
      value: null,
      unit: "sqft",
      status: "unresolved",
      formula: null,
      sourceNote: "Wall area needs a confirmed or provisional ceiling height. Height was not guessed.",
      geometryRefs: refs,
    };
  }
  const length = dimension?.valueFt != null && dimension.status !== "conflicting" ? dimension.valueFt : edgeLength(room.polygon, edgeIndex);
  const lengthStatus: QuantityStatus =
    dimension?.status === "confirmed" ? "confirmed" : dimension?.status === "conflicting" ? "unresolved" : "provisional";
  if (lengthStatus === "unresolved") {
    return {
      value: null,
      unit: "sqft",
      status: "unresolved",
      formula: null,
      sourceNote: "Wall length conflicts with geometry and was not used.",
      geometryRefs: refs,
    };
  }
  let openingDeduction = 0;
  const deducted: string[] = [];
  if (rules.deductOpenings) {
    for (const opening of openings.filter((o) => o.roomId === room.roomId && o.edgeIndex === edgeIndex)) {
      if (opening.widthFt == null || opening.heightFt == null) continue;
      openingDeduction += opening.widthFt * opening.heightFt;
      deducted.push(`${opening.kind} ${opening.widthFt}×${opening.heightFt}`);
    }
  }
  const net = Math.max(0, length * heightFt - openingDeduction);
  const withWaste = net * (1 + Math.max(0, rules.wasteFactor));
  return {
    value: roundQty(withWaste),
    unit: "sqft",
    status: statusFrom([lengthStatus, heightStatus, room.incomplete ? "unresolved" : "confirmed"]),
    formula: `max(0, length ${roundQty(length)} ft × height ${roundQty(heightFt)} ft − openings ${roundQty(openingDeduction)} sqft) × (1 + waste ${rules.wasteFactor})`,
    sourceNote: deducted.length ? `Deductions: ${deducted.join(", ")}.` : "No opening deductions applied on this edge.",
    geometryRefs: refs,
  };
}

/** Repair extent is never silently replaced with the whole room. */
export function affectedArea(input: { valueFt2: number | null; status: QuantityStatus; sourceNote: string; geometryRefs?: string[] }): Quantity {
  if (input.valueFt2 == null) {
    return {
      value: null,
      unit: "sqft",
      status: "unresolved",
      formula: null,
      sourceNote: input.sourceNote || "Affected area was not measured. Total room area was not substituted.",
      geometryRefs: input.geometryRefs ?? [],
    };
  }
  return {
    value: roundQty(input.valueFt2),
    unit: "sqft",
    status: input.status,
    formula: "user or evidence-bounded affected area",
    sourceNote: input.sourceNote,
    geometryRefs: input.geometryRefs ?? [],
  };
}

export function parseMeasurement(text: string): { valueFt: number; formula: string } | null {
  const cleaned = text.trim().toLowerCase().replace(/′/g, "'").replace(/″/g, '"');
  const metric = cleaned.match(/(-?\d+(?:\.\d+)?)\s*(m|meter|meters)\b/);
  if (metric) {
    const meters = Number(metric[1]);
    return { valueFt: roundQty(metersToFeet(meters), 3), formula: `${meters} m × 3.280839895` };
  }
  const feetInches = cleaned.match(/(-?\d+(?:\.\d+)?)\s*(?:ft|foot|feet|')\s*(-?\d+(?:\.\d+)?)?\s*(?:in|inch|inches|")?/);
  if (feetInches) {
    const feet = Number(feetInches[1]);
    const inches = feetInches[2] ? Number(feetInches[2]) : 0;
    return { valueFt: roundQty(feet + inchesToFeet(inches), 3), formula: `${feet} ft + ${inches} in / 12` };
  }
  const inchesOnly = cleaned.match(/(-?\d+(?:\.\d+)?)\s*(?:in|inch|inches|")\b/);
  if (inchesOnly) {
    const inches = Number(inchesOnly[1]);
    return { valueFt: roundQty(inchesToFeet(inches), 3), formula: `${inches} in / 12` };
  }
  return null;
}
