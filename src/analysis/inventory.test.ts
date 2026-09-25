import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { floorPlanFromMeasurement, recordedSyntheticRoom } from "@/domain/plan-from-measurement";
import { inventoryFromWalkthrough } from "@/analysis/inventory";
import { dedupeObjects, extractChatContent, frameTimeMs, parseVisionObjects, selectKeyframes } from "@/analysis/openai/vision";

const recorded = JSON.parse(readFileSync(path.resolve(__dirname, "../../fixtures/providers/vision.json"), "utf8"));

describe("object inventory", () => {
  it("selects spread keyframes and timestamps them at 2 fps", () => {
    const frames = Array.from({ length: 16 }, (_, index) => ({ name: `frame_${String(index).padStart(2, "0")}.jpg` }));
    const chosen = selectKeyframes(frames, 4);
    expect(chosen.map((frame) => frame.name)).toEqual(["frame_00.jpg", "frame_05.jpg", "frame_10.jpg", "frame_15.jpg"]);
    expect(frameTimeMs("frame_05.jpg")).toBe(2500);
    const crowded = [
      { name: "a.jpg", timeMs: 0 },
      { name: "b.jpg", timeMs: 100 },
      { name: "c.jpg", timeMs: 2000 },
    ];
    expect(selectKeyframes(crowded, 4).map((frame) => frame.name)).toEqual(["a.jpg", "c.jpg"]);
  });

  it("counts a recorded vision response once and keeps frame times", () => {
    const text = extractChatContent(recorded);
    expect(text).toBeTruthy();
    const first = parseVisionObjects(JSON.parse(text ?? "{}"), ["frame_02.jpg", "frame_10.jpg"]);
    const second = parseVisionObjects(JSON.parse(text ?? "{}"), ["frame_10.jpg"]);
    const objects = dedupeObjects([...first, ...second]);
    expect(objects).toHaveLength(1);
    expect(objects[0]?.name).toBe("Floor lamp");
    expect(objects[0]?.room).toBe("Living room");
    expect(objects[0]?.links?.map((link) => link.timeMs)).toEqual([1000, 5000]);
    const plan = floorPlanFromMeasurement([recordedSyntheticRoom]);
    const lines = inventoryFromWalkthrough([...objects, { name: "Upper cabinets", room: "Kitchen", evidence: "Cabinet faces are visible.", confidence: "medium", frames: ["frame_02.jpg"], links: [{ frame: "frame_02.jpg", timeMs: 1000 }] }], plan);
    const flooring = lines.find((line) => line.name === "Flooring");
    expect(flooring?.source).toBe("sketch");
    expect(flooring?.quantity).toBeGreaterThan(0);
    expect(flooring?.unit).toBe("sqft");
    const lamp = lines.find((line) => line.name === "Floor lamp");
    expect(lamp?.count).toBe(1);
    expect(lamp?.links[0]?.timeMs).toBe(1000);
    const cabinets = lines.find((line) => line.name === "Upper cabinets");
    expect(cabinets?.quantity).toBeNull();
    expect(cabinets?.note).toMatch(/not measured/);
  });
});
