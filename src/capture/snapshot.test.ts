import { describe, expect, it, vi } from "vitest";
import { floorPlanFromMeasurement, recordedSyntheticRoom } from "@/domain/plan-from-measurement";
import { gapsFromSnapshot, loadWalkthrough, saveWalkthrough, type WalkthroughSnapshot } from "./snapshot";

describe("walkthrough gaps", () => {
  it("lists estimated walls and does not call them confirmed", () => {
    const plan = floorPlanFromMeasurement([recordedSyntheticRoom]);
    const gaps = gapsFromSnapshot({
      savedAt: "2026-09-25T00:00:00.000Z",
      source: "recorded-preview",
      transcript: null,
      transcriptNote: "Recorded preview.",
      plan,
      objects: [],
      offers: [],
    });
    expect(gaps.some((gap) => /estimated, not confirmed/.test(gap))).toBe(true);
    expect(gaps.some((gap) => /ceiling height is estimated/.test(gap))).toBe(true);
    expect(gaps.some((gap) => /confirmed/.test(gap) && !/not confirmed/.test(gap))).toBe(false);
  });

  it("does not list an imported ceiling as an open gap", () => {
    const plan = floorPlanFromMeasurement([{
      id: "kitchen",
      name: "Kitchen",
      dimensions: [
        { kind: "wall_length", label: "width", valueFt: 10, importedFrom: "CSV" },
        { kind: "wall_length", label: "depth", valueFt: 12, importedFrom: "CSV" },
        { kind: "ceiling_height", label: "height", valueFt: 8, importedFrom: "CSV" },
      ],
    }]);
    const gaps = gapsFromSnapshot({
      savedAt: "2026-09-25T00:00:00.000Z",
      source: "import",
      transcript: null,
      transcriptNote: "Imported plan.",
      plan,
      objects: [],
      offers: [],
    });
    expect(plan.ceilingHeights.kitchen.provenance).toBe("imported");
    expect(gaps.some((gap) => /ceiling/.test(gap))).toBe(false);
    expect(gaps.some((gap) => /wall/.test(gap))).toBe(false);
  });

  it("keeps the finalized report, record, and video when a later save omits them", () => {
    const store = new Map<string, string>();
    vi.stubGlobal("localStorage", {
      getItem: (key: string) => store.get(key) ?? null,
      setItem: (key: string, value: string) => { store.set(key, value); },
    });
    const plan = floorPlanFromMeasurement([recordedSyntheticRoom]);
    const base: WalkthroughSnapshot = {
      savedAt: "2026-09-25T00:00:00.000Z",
      source: "measurement",
      transcript: null,
      transcriptNote: "Test.",
      plan,
      objects: [],
      offers: [],
      finalReport: { id: "report-1", status: "final" } as WalkthroughSnapshot["finalReport"],
      recordId: "rec-1",
      videoKey: "walkthroughs/v",
    };
    saveWalkthrough(base);
    saveWalkthrough({
      savedAt: "2026-09-25T01:00:00.000Z",
      source: "import",
      transcript: null,
      transcriptNote: "Imported plan. No narration was attached.",
      plan,
      objects: [],
      offers: [],
    });
    const loaded = loadWalkthrough();
    expect(loaded?.source).toBe("import");
    expect(loaded?.finalReport?.id).toBe("report-1");
    expect(loaded?.recordId).toBe("rec-1");
    expect(loaded?.videoKey).toBe("walkthroughs/v");
    vi.unstubAllGlobals();
  });
});