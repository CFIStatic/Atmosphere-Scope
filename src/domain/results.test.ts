import { describe, expect, it } from "vitest";
import { inventoryFromWalkthrough } from "@/analysis/inventory";
import { floorPlanFromMeasurement, recordedSyntheticRoom } from "@/domain/plan-from-measurement";
import { buildResultLines, chooseReplacement, overrideReplacement, resultTotals, type ResultOffer } from "@/domain/results";

const offer: ResultOffer = {
  query: "AA alkaline batteries",
  title: "AA alkaline batteries",
  retailer: "Example",
  price: 12.99,
  currency: "USD",
  url: "https://shop.example/batteries",
  status: "unverified",
  note: "Recorded model response. The retailer page was not fetched.",
};

describe("priced results", () => {
  it("prices a matching offer and leaves sketch lines blank when no page was checked", () => {
    const plan = floorPlanFromMeasurement([recordedSyntheticRoom]);
    const items = inventoryFromWalkthrough([
      { name: "AA alkaline batteries", room: "Hall", evidence: "Recorded response.", confidence: "low", frames: ["frame_02.jpg"], links: [{ frame: "frame_02.jpg", timeMs: 1000 }] },
    ], plan);
    const lines = buildResultLines(items, [offer, { ...offer, title: "Other pack", price: 9.5, url: "https://shop.example/other" }]);
    const batteries = lines.find((line) => line.item === "AA alkaline batteries");
    expect(batteries?.lineTotal).toBe(12.99);
    expect(batteries?.replacements[0]?.status).toBe("unverified");
    expect(batteries?.links[0]?.timeMs).toBe(1000);
    const flooring = lines.find((line) => line.item === "Flooring");
    expect(flooring?.lineTotal).toBeNull();
    expect(flooring?.replacements[0]?.status).toBe("unpriced");
    const picked = chooseReplacement(lines, batteries!.id, 1);
    expect(picked.find((line) => line.id === batteries!.id)?.lineTotal).toBe(9.5);
    const totals = resultTotals(picked);
    expect(totals.job).toBe(9.5);
    expect(totals.note).toMatch(/unverified/);
  });

  it("keeps a hand-entered price unverified and does not invent a total without a quantity", () => {
    const lines = buildResultLines([
      { name: "Upper cabinets", room: "Kitchen", count: 1, quantity: null, unit: "lf", source: "vision", evidence: "Cabinet faces.", links: [], note: "Length was not measured." },
    ], []);
    const overridden = overrideReplacement(lines, lines[0].id, { title: "Stock cabinet", unitPrice: 240 });
    expect(overridden[0]?.lineTotal).toBeNull();
    expect(overridden[0]?.replacements.at(-1)?.status).toBe("manual");
    expect(overridden[0]?.replacements.at(-1)?.note).toMatch(/Not checked/);
    expect(resultTotals(overridden).job).toBeNull();
  });
});
