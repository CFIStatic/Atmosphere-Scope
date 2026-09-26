import type { FloorPlan } from "@/domain/plan-from-measurement";
import type { IdentifiedObject } from "@/analysis/frames";

export type LossType = "none" | "water" | "fire";
export type CatalogTrigger = "sketch" | "water" | "fire" | "contents" | "object";
export type QuantityBasis = "floor_area" | "wall_area" | "baseboard" | "each";

export type CatalogComponent =
  | { kind: "labor"; trade: string; hoursPerUnit: number }
  | { kind: "material"; query: string }
  | { kind: "equipment"; equipment: string; perUnit: number };

export type CatalogItem = {
  code: string;
  category: "mitigation" | "rebuild" | "contents";
  description: string;
  unit: "sqft" | "lf" | "each";
  basis: QuantityBasis;
  triggers: CatalogTrigger[];
  components: CatalogComponent[];
};

export type CatalogVersion = {
  id: string;
  version: number;
  publishedAt: string;
  name: string;
  note: string;
  items: CatalogItem[];
};

export type DraftLine = {
  code: string;
  room: string;
  description: string;
  basis: QuantityBasis;
  quantity: number | null;
  unit: CatalogItem["unit"];
  quantityNote: string;
  materialQuery: string | null;
  components: CatalogComponent[];
};

export const STARTER_CATALOG: CatalogVersion = {
  id: "catalog-starter-1",
  version: 1,
  publishedAt: "2026-09-25",
  name: "Residential interior starter",
  note: "Starter catalog for water, fire, and rebuild interiors. Hours per unit are production assumptions, not prices. Publish a new version to change it. A finalized report keeps the version it used.",
  items: [
    item("MIT-PROTECT", "mitigation", "Protect floors and contents at the work area", "sqft", "floor_area", ["water", "fire"], [
      { kind: "labor", trade: "general", hoursPerUnit: 0.02 },
      { kind: "material", query: "floor protection film" },
    ]),
    item("MIT-EXTRACT", "mitigation", "Extract standing water", "sqft", "floor_area", ["water"], [
      { kind: "labor", trade: "general", hoursPerUnit: 0.03 },
      { kind: "equipment", equipment: "extractor", perUnit: 0.002 },
    ]),
    item("MIT-DRY", "mitigation", "Dry the affected area and record readings", "sqft", "floor_area", ["water"], [
      { kind: "labor", trade: "general", hoursPerUnit: 0.015 },
      { kind: "equipment", equipment: "air mover", perUnit: 0.01 },
      { kind: "equipment", equipment: "dehumidifier", perUnit: 0.004 },
    ]),
    item("MIT-DEMO-DRYWALL", "mitigation", "Remove affected drywall", "sqft", "wall_area", ["water", "fire"], [
      { kind: "labor", trade: "carpenter", hoursPerUnit: 0.05 },
    ]),
    item("MIT-DEMO-FLOOR", "mitigation", "Remove affected flooring", "sqft", "floor_area", ["water", "fire"], [
      { kind: "labor", trade: "floor", hoursPerUnit: 0.06 },
    ]),
    item("MIT-SOOT", "mitigation", "Clean soot from exposed surfaces", "sqft", "wall_area", ["fire"], [
      { kind: "labor", trade: "general", hoursPerUnit: 0.04 },
      { kind: "material", query: "soot cleaner" },
    ]),
    item("MIT-SEAL", "mitigation", "Seal odor on exposed framing", "sqft", "wall_area", ["fire"], [
      { kind: "labor", trade: "painter", hoursPerUnit: 0.03 },
      { kind: "material", query: "odor sealer" },
    ]),
    item("REB-DRYWALL", "rebuild", "Hang and finish drywall", "sqft", "wall_area", ["sketch"], [
      { kind: "labor", trade: "carpenter", hoursPerUnit: 0.08 },
      { kind: "material", query: "drywall panel" },
    ]),
    item("REB-PAINT", "rebuild", "Prime and paint repaired walls", "sqft", "wall_area", ["sketch"], [
      { kind: "labor", trade: "painter", hoursPerUnit: 0.04 },
      { kind: "material", query: "interior paint" },
    ]),
    item("REB-BASE", "rebuild", "Install baseboard", "lf", "baseboard", ["sketch"], [
      { kind: "labor", trade: "carpenter", hoursPerUnit: 0.08 },
      { kind: "material", query: "baseboard" },
    ]),
    item("REB-FLOOR", "rebuild", "Install flooring", "sqft", "floor_area", ["sketch"], [
      { kind: "labor", trade: "floor", hoursPerUnit: 0.1 },
      { kind: "material", query: "flooring" },
    ]),
    item("CON-REPLACE", "contents", "Replace a listed content item", "each", "each", ["contents"], [
      { kind: "labor", trade: "general", hoursPerUnit: 0.25 },
      { kind: "material", query: "" },
    ]),
    item("MIT-FLOOD-CUT", "mitigation", "Flood cut drywall to the stated height", "lf", "baseboard", ["object"], [
      { kind: "labor", trade: "carpenter", hoursPerUnit: 0.12 },
    ]),
    item("MIT-ANTIMICROBIAL", "mitigation", "Apply antimicrobial treatment to the affected area", "sqft", "wall_area", ["object"], [
      { kind: "labor", trade: "general", hoursPerUnit: 0.02 },
      { kind: "material", query: "antimicrobial treatment" },
    ]),
    item("MIT-REMOVE-FINISH", "mitigation", "Remove affected drywall", "sqft", "wall_area", ["object"], [
      { kind: "labor", trade: "carpenter", hoursPerUnit: 0.05 },
    ]),
    item("MIT-DEMO-BASE", "mitigation", "Remove affected baseboard", "lf", "baseboard", ["object"], [
      { kind: "labor", trade: "carpenter", hoursPerUnit: 0.04 },
    ]),
    item("COND-INSPECT", "mitigation", "Qualified inspection of staining", "each", "each", ["object"], [
      { kind: "labor", trade: "general", hoursPerUnit: 1 },
    ]),
    item("CON-CLEAN", "contents", "Clean a listed content item", "each", "each", ["object"], [
      { kind: "labor", trade: "general", hoursPerUnit: 0.2 },
    ]),
  ],
};

export function draftScope(input: { plan: FloorPlan; objects: IdentifiedObject[]; catalog: CatalogVersion; loss: LossType }): DraftLine[] {
  const lines: DraftLine[] = [];
  for (const [roomId, roomName] of Object.entries(input.plan.names)) {
    for (const entry of input.catalog.items) {
      if (!entry.triggers.includes("sketch") && !(input.loss === "water" && entry.triggers.includes("water")) && !(input.loss === "fire" && entry.triggers.includes("fire"))) continue;
      if (entry.triggers.includes("contents")) continue;
      const quantity = input.plan.quantities.find((item) => item.roomId === roomId && item.kind === entry.basis);
      lines.push({
        code: entry.code,
        room: roomName,
        description: entry.description,
        basis: entry.basis,
        quantity: quantity?.value ?? null,
        unit: entry.unit,
        quantityNote: quantity?.note ?? "This quantity is not on the sketch.",
        materialQuery: entry.components.find((component) => component.kind === "material")?.query ?? null,
        components: entry.components,
      });
    }
  }
  const contents = input.catalog.items.find((entry) => entry.code === "CON-REPLACE");
  if (contents) {
    for (const object of input.objects) {
      lines.push({
        code: contents.code,
        room: object.room ?? "Room not assigned",
        description: `${contents.description}: ${object.name}`,
        basis: "each",
        quantity: object.quantity !== undefined ? object.quantity : 1,
        unit: "each",
        quantityNote: "Counted once from the walkthrough. Not measured.",
        materialQuery: object.name,
        components: contents.components,
      });
    }
  }
  return lines;
}

export function nextCatalogVersion(current: CatalogVersion, items: CatalogItem[], publishedAt: string): CatalogVersion {
  return {
    id: `catalog-${current.version + 1}`,
    version: current.version + 1,
    publishedAt,
    name: current.name,
    note: current.note,
    items,
  };
}

function item(code: string, category: CatalogItem["category"], description: string, unit: CatalogItem["unit"], basis: QuantityBasis, triggers: CatalogTrigger[], components: CatalogComponent[]): CatalogItem {
  return { code, category, description, unit, basis, triggers, components };
}
