import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { floorPlanFromMeasurement } from "@/domain/plan-from-measurement";
import { crossCheckPlans, importFloorPlan, parseLength } from "./floor-plan";

const fixture = (name: string) => readFileSync(path.resolve(__dirname, "../../fixtures/imports", name), "utf8");

describe("floor plan import", () => {
  it("parses feet and inches", () => {
    expect(parseLength("12' 6\"")).toBe(12.5);
    expect(parseLength("10' 6\"")).toBe(10.5);
    expect(parseLength("8")).toBe(8);
  });

  it("reads a generic CSV and a magicplan statistics file as imported walls", () => {
    const csv = importFloorPlan({ filename: "rooms.csv", text: fixture("rooms.csv") });
    expect(csv.source).toBe("csv");
    expect(csv.plan.edges.filter((edge) => edge.roomId.startsWith("kitchen")).every((edge) => edge.status === "imported" && edge.stroke === "solid")).toBe(true);
    expect(csv.plan.quantities.find((item) => item.roomName === "Kitchen" && item.kind === "floor_area")?.value).toBe(168);
    expect(csv.plan.quantities.find((item) => item.kind === "floor_area")?.status).not.toBe("confirmed");
    const magic = importFloorPlan({ filename: "stats.csv", text: fixture("magicplan-stats.csv") });
    expect(magic.source).toBe("magicplan");
    expect(magic.sourceLabel).toMatch(/magicplan/);
    const dining = magic.plan.quantities.find((item) => item.roomName === "Dining" && item.kind === "floor_area");
    expect(dining?.value).toBeCloseTo(10.5 * 12, 2);
    expect(dining?.note).toMatch(/magicplan/);
  });

  it("reads DXF feet and SVG only with an entered scale", () => {
    const dxf = importFloorPlan({ filename: "kitchen.dxf", text: fixture("kitchen.dxf") });
    expect(dxf.plan.quantities.find((item) => item.kind === "floor_area")?.value).toBe(120);
    expect(dxf.notes.join(" ")).toMatch(/\$INSUNITS/);
    expect(() => importFloorPlan({ filename: "bare.dxf", text: "0\nSECTION\n2\nENTITIES\n0\nLWPOLYLINE\n70\n1\n10\n0\n20\n0\n10\n1\n20\n0\n10\n1\n20\n1\n0\nENDSEC\n" })).toThrow(/INSUNITS/);
    expect(() => importFloorPlan({ filename: "kitchen.svg", text: fixture("kitchen.svg") })).toThrow(/feet/);
    const svg = importFloorPlan({ filename: "kitchen.svg", text: fixture("kitchen.svg"), feetPerUnit: 1 });
    expect(svg.plan.names[svg.plan.rooms[0].roomId]).toBe("Kitchen");
    expect(svg.plan.quantities.find((item) => item.kind === "floor_area")?.value).toBe(168);
  });

  it("keeps Hover area without inventing wall lengths", () => {
    const hover = importFloorPlan({ filename: "hover-interior.json", text: fixture("hover-interior.json") });
    expect(hover.source).toBe("hover");
    expect(hover.plan.edges.every((edge) => edge.status === "unmeasured")).toBe(true);
    const floor = hover.plan.quantities.find((item) => item.kind === "floor_area");
    expect(floor?.value).toBe(99.54);
    expect(floor?.status).toBe("imported");
    expect(floor?.note).toMatch(/not in the file/i);
    expect(hover.plan.quantities.find((item) => item.kind === "wall_area")?.value).toBeCloseTo(81.55 + 53.15, 2);
    expect(hover.plan.openings).toHaveLength(0);
    expect(hover.notes.join(" ")).toMatch(/not guessed/i);
  });

  it("cross-checks an import against a video plan and does not replace either", () => {
    const imported = importFloorPlan({ filename: "rooms.csv", text: fixture("rooms.csv") });
    const video = floorPlanFromMeasurement([{
      id: "video-kitchen",
      name: "Kitchen",
      dimensions: [
        { kind: "wall_length", label: "width", valueFt: 12.4, confirmed: false },
        { kind: "wall_length", label: "depth", valueFt: 14, confirmed: false },
      ],
    }]);
    const before = imported.plan.quantities.find((item) => item.roomName === "Kitchen" && item.kind === "floor_area")?.value;
    const checks = crossCheckPlans(imported.plan, video);
    const width = checks.find((item) => item.room === "Kitchen" && item.item === "Wall 1");
    expect(width?.note).toMatch(/differ|Within 5%/);
    expect(checks.some((item) => /Hall/.test(item.room) && /not compared/.test(item.note))).toBe(true);
    expect(imported.plan.quantities.find((item) => item.roomName === "Kitchen" && item.kind === "floor_area")?.value).toBe(before);
  });
});
