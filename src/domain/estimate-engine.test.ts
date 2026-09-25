import { describe, expect, it } from "vitest";
import { STARTER_CATALOG, draftScope, nextCatalogVersion } from "./catalog";
import { STARTER_RATES, finalizeReport, priceDraft, reportCsv, type RateBook } from "./estimate-engine";
import { floorPlanFromMeasurement } from "./plan-from-measurement";

const plan = floorPlanFromMeasurement([{
  id: "kitchen",
  name: "Kitchen",
  dimensions: [
    { kind: "wall_length", label: "width", valueFt: 10, importedFrom: "CSV" },
    { kind: "wall_length", label: "depth", valueFt: 12, importedFrom: "CSV" },
    { kind: "ceiling_height", label: "height", valueFt: 8, importedFrom: "CSV" },
  ],
}]);

const rated: RateBook = {
  ...STARTER_RATES,
  id: "rates-test",
  region: "Example metro",
  labor: STARTER_RATES.labor.map((rate) => ({ ...rate, hourlyUsd: rate.trade === "general" ? 40 : 55, source: "Admin entry", asOf: "2026-09-01" })),
  equipment: STARTER_RATES.equipment.map((rate) => ({ ...rate, rateUsd: 80, source: "Admin entry", asOf: "2026-09-01" })),
};

describe("own estimate", () => {
  it("maps sketch quantities onto the catalog and leaves missing rates unpriced", () => {
    const lines = draftScope({ plan, objects: [{ name: "Floor lamp", room: "Kitchen", evidence: "Seen.", confidence: "low", frames: [] }], catalog: STARTER_CATALOG, loss: "none" });
    expect(lines.some((line) => line.code === "REB-FLOOR" && line.quantity === 120)).toBe(true);
    expect(lines.some((line) => line.code === "MIT-EXTRACT")).toBe(false);
    expect(lines.some((line) => line.description.includes("Floor lamp"))).toBe(true);
    const counted = draftScope({ plan, objects: [{ name: "Floor lamp", room: "Kitchen", evidence: "Seen.", confidence: "low", frames: [], quantity: 3 }], catalog: STARTER_CATALOG, loss: "none" });
    expect(counted.find((line) => line.description.includes("Floor lamp"))?.quantity).toBe(3);
    const report = priceDraft(lines, STARTER_CATALOG, STARTER_RATES, []);
    expect(report.lines.every((line) => line.lineTotal == null)).toBe(true);
    expect(report.note).toMatch(/not filled in/);
    expect(report.schema).toBe("atmosphere.estimate.v1");
  });

  it("prices labor, equipment, and a sourced material, and locks the finalized copy", () => {
    const lines = draftScope({ plan, objects: [], catalog: STARTER_CATALOG, loss: "water" });
    const report = priceDraft(lines, STARTER_CATALOG, rated, [
      { query: "floor protection film", unitPrice: 0.4, source: "Example store", asOf: "2026-09-20", status: "unverified" },
      { query: "drywall panel", unitPrice: 1, source: "Example store", asOf: "2026-09-20", status: "verified" },
      { query: "interior paint", unitPrice: 0.5, source: "Example store", asOf: "2026-09-20", status: "unverified" },
      { query: "baseboard", unitPrice: 2, source: "Example store", asOf: "2026-09-20", status: "unverified" },
      { query: "flooring", unitPrice: 3, source: "Example store", asOf: "2026-09-20", status: "verified" },
    ]);
    const floor = report.lines.find((line) => line.code === "REB-FLOOR");
    expect(floor?.lineTotal).toBeGreaterThan(0);
    expect(floor?.componentsPriced.find((component) => component.kind === "material")?.source).toMatch(/verified: Example store/);
    expect(floor?.componentsPriced.find((component) => component.kind === "labor")?.asOf).toBe("2026-09-01");
    const extract = report.lines.find((line) => line.code === "MIT-EXTRACT");
    expect(extract?.lineTotal).toBeGreaterThan(0);
    const soot = report.lines.find((line) => line.code === "MIT-SOOT");
    expect(soot).toBeUndefined();
    const finalReport = finalizeReport(report, "2026-09-25T12:00:00.000Z");
    const revised = priceDraft(lines, nextCatalogVersion(STARTER_CATALOG, STARTER_CATALOG.items, "2026-10-01"), { ...rated, labor: rated.labor.map((rate) => ({ ...rate, hourlyUsd: 999 })) }, []);
    expect(finalReport.status).toBe("final");
    expect(finalReport.catalogVersionId).toBe("catalog-starter-1");
    expect(finalReport.lines.find((line) => line.code === "REB-FLOOR")?.lineTotal).toBe(floor?.lineTotal);
    expect(revised.catalogVersionId).not.toBe(finalReport.catalogVersionId);
    expect(reportCsv(finalReport)).toContain("catalog-starter-1");
    expect(reportCsv(finalReport)).toContain("REB-FLOOR");
  });

  it("uses each room id when two rooms share a display name", () => {
    const shared = floorPlanFromMeasurement([
      { id: "kitchen-1", name: "Kitchen", dimensions: [{ kind: "wall_length", label: "width", valueFt: 10, importedFrom: "CSV" }, { kind: "wall_length", label: "depth", valueFt: 12, importedFrom: "CSV" }] },
      { id: "kitchen-2", name: "Kitchen", dimensions: [{ kind: "wall_length", label: "width", valueFt: 8, importedFrom: "CSV" }, { kind: "wall_length", label: "depth", valueFt: 8, importedFrom: "CSV" }] },
    ]);
    const lines = draftScope({ plan: shared, objects: [], catalog: STARTER_CATALOG, loss: "none" });
    const floors = lines.filter((line) => line.code === "REB-FLOOR").map((line) => line.quantity).sort((left, right) => (left ?? 0) - (right ?? 0));
    expect(floors).toEqual([64, 120]);
  });
});
