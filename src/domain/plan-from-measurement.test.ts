import { describe, expect, it } from "vitest";
import { correctPlanEdge, correctPlanHeight, floorPlanFromMeasurement, type MeasuredRoomInput } from "./plan-from-measurement";

const synthetic: MeasuredRoomInput = {
  id: "kitchen",
  name: "Kitchen",
  dimensions: [
    { kind: "wall_length", label: "span_a", valueFt: 11.981, confirmed: false, meetsAccuracyTarget: true, note: "Sheet solve." },
    { kind: "wall_length", label: "span_b", valueFt: 13.913, confirmed: false, note: "Sheet solve." },
    { kind: "ceiling_height", label: "height", valueFt: 7.987, confirmed: false, note: "Estimated ceiling." },
  ],
};

describe("floor plan from measurement", () => {
  it("draws measured walls solid and leaves an unmeasured ceiling out of a confirmed claim", () => {
    const plan = floorPlanFromMeasurement([synthetic]);
    const edges = plan.edges.filter((edge) => edge.roomId === "kitchen");
    expect(edges).toHaveLength(4);
    expect(edges.every((edge) => edge.stroke === "solid" && edge.status === "estimated")).toBe(true);
    expect(edges.some((edge) => edge.label.includes("11.981"))).toBe(true);
    expect(edges.some((edge) => edge.label.includes("13.913"))).toBe(true);
    expect(edges.some((edge) => edge.status === "confirmed")).toBe(false);
    expect(plan.ceilingHeights.kitchen.status).toBe("provisional");
    const floor = plan.quantities.find((item) => item.kind === "floor_area");
    expect(floor?.status).toBe("estimated");
    expect(floor?.value).toBeCloseTo(11.981 * 13.913, 2);
    const walls = plan.quantities.find((item) => item.kind === "wall_area");
    expect(walls?.value).toBeCloseTo((11.981 + 13.913) * 2 * 7.987, 1);
    expect(walls?.status).toBe("estimated");
  });

  it("keeps unknown walls dashed and does not invent quantities", () => {
    const plan = floorPlanFromMeasurement([{ id: "hall", name: "Hall", dimensions: [{ kind: "wall_length", label: "span_a", valueFt: null, note: "No wall." }] }]);
    expect(plan.edges.every((edge) => edge.stroke === "dashed" && edge.valueFt == null)).toBe(true);
    expect(plan.quantities.every((item) => item.value == null && item.status === "unmeasured")).toBe(true);
    expect(plan.rooms[0]?.incomplete).toBe(true);
  });

  it("places connected rooms side by side and draws only supplied openings and pins", () => {
    const plan = floorPlanFromMeasurement([
      synthetic,
      {
        id: "dining",
        name: "Dining",
        dimensions: [
          { kind: "wall_length", label: "width", valueFt: 10, confirmed: true },
          { kind: "wall_length", label: "depth", valueFt: 12, confirmed: true },
        ],
        openings: [{ kind: "door", edgeIndex: 1, widthFt: null, connectsToRoomId: "kitchen" }],
        markers: [{ kind: "moisture", text: "Meter was not read.", at: { x: 1, y: 1 } }, { kind: "question", text: "Ceiling stain. Cause unknown." }],
      },
    ]);
    const kitchen = plan.rooms.find((room) => room.roomId === "kitchen");
    const dining = plan.rooms.find((room) => room.roomId === "dining");
    expect(kitchen && dining).toBeTruthy();
    expect(Math.min(...dining!.polygon.map((point) => point.x))).toBeGreaterThan(Math.max(...kitchen!.polygon.map((point) => point.x)));
    expect(plan.openings).toHaveLength(1);
    expect(plan.openings[0]?.widthFt).toBeNull();
    expect(plan.openings[0]?.connectionStatus).toBe("inferred");
    expect(plan.annotations.map((item) => item.text).join(" ")).toMatch(/Moisture/);
    expect(plan.annotations.map((item) => item.text).join(" ")).toMatch(/Open question/);
    expect(plan.edges.filter((edge) => edge.roomId === "dining").every((edge) => edge.status === "confirmed" && edge.stroke === "solid")).toBe(true);
  });

  it("updates quantities from a user correction without confirming the facing wall", () => {
    const plan = floorPlanFromMeasurement([synthetic]);
    const corrected = correctPlanEdge(plan, "kitchen", 0, 10, false);
    const floor = corrected.quantities.find((item) => item.kind === "floor_area");
    expect(floor?.value).toBeCloseTo(10 * 13.913, 2);
    expect(floor?.status).toBe("estimated");
    const edited = corrected.edges.find((edge) => edge.edgeIndex === 0);
    const facing = corrected.edges.find((edge) => edge.edgeIndex === 2);
    expect(edited?.label).toMatch(/estimated/);
    expect(facing?.status).not.toBe("confirmed");
    const locked = correctPlanEdge(corrected, "kitchen", 0, 10, true);
    expect(locked.edges.find((edge) => edge.edgeIndex === 0)?.status).toBe("confirmed");
    expect(locked.edges.find((edge) => edge.edgeIndex === 1)?.status).toBe("estimated");
    const cleared = correctPlanHeight(locked, "kitchen", null, false);
    expect(cleared.quantities.find((item) => item.kind === "wall_area")?.value).toBeNull();
    expect(cleared.ceilingHeights.kitchen.sourceNote).toMatch(/not guessed/i);
  });
});
