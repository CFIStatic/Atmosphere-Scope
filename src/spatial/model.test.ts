import { describe, expect, it } from "vitest";
import { createEmptyJob, runPipeline } from "@/analysis/pipeline";
import { SCENARIOS, scenarioBundle } from "@/samples/scenarios";
import { assumedHeightsAreLabeled, buildSpaceModel, SCHEMATIC_HEIGHT_FT } from "./model";
import { importDepthPayload, type DepthPayload } from "./depth";

describe("space model", () => {
  it("extrudes analyzed rooms and refuses to treat a filler height as measured", () => {
    const scenario = SCENARIOS[0];
    const job = runPipeline(
      createEmptyJob({
        address: scenario.address,
        city: scenario.city,
        region: scenario.region,
        postalCode: scenario.postalCode,
        customerName: scenario.customerName,
        phone: "",
        email: "",
        concern: scenario.concern,
      }),
      { ...scenarioBundle(scenario), usePriceBook: true },
    );
    const model = buildSpaceModel(job);
    expect(model.rooms.length).toBeGreaterThan(1);
    expect(model.claim).not.toBe("measurement_confirmed");
    expect(model.disclaimer).toMatch(/not photogrammetry|viewing aid|not a certified/i);
    const hallway = model.rooms.find((room) => room.name === "Hallway");
    expect(hallway?.heightVisual).toBe("assumed_schematic");
    expect(hallway?.heightFt).toBe(SCHEMATIC_HEIGHT_FT);
    expect(assumedHeightsAreLabeled(model)).toBe(true);
    const kitchen = model.rooms.find((room) => room.name === "Kitchen");
    expect(kitchen?.heightVisual).toBe("provisional");
    expect(kitchen?.polygon.length).toBeGreaterThan(4);
    expect(model.markers.some((marker) => /stain|standing water|height not measured/i.test(marker.label))).toBe(true);
  });

  it("imports depth as inferred geometry rather than a confirmed survey", () => {
    const scenario = SCENARIOS[2];
    const job = runPipeline(
      createEmptyJob({
        address: scenario.address,
        city: scenario.city,
        region: scenario.region,
        postalCode: scenario.postalCode,
        customerName: scenario.customerName,
        phone: "",
        email: "",
        concern: scenario.concern,
      }),
      { ...scenarioBundle(scenario), usePriceBook: false },
    );
    const payload: DepthPayload = {
      format: "atmosphere-depth-v1",
      rooms: [{ name: "Laundry", polygonFt: [{ x: 0, y: 0 }, { x: 6, y: 0 }, { x: 6, y: 7 }, { x: 0, y: 7 }], heightFt: 9 }],
    };
    const imported = importDepthPayload(job, payload);
    const laundry = imported.rooms.find((room) => room.name === "Laundry");
    expect(laundry).toBeTruthy();
    const edge = imported.sketch.geometry.dimensions.find((dimension) => dimension.target.type === "edge" && dimension.target.roomId === laundry?.id);
    expect(edge?.locked).toBe(false);
    expect(edge?.status).toBe("inferred");
    expect(imported.sketch.scaleClaim).toBe("not_to_scale");
    expect(buildSpaceModel(imported).rooms.some((room) => room.name === "Laundry" && room.heightVisual === "provisional")).toBe(true);
  });
});
