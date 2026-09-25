import { describe, expect, it } from "vitest";
import { floorPlanFromMeasurement, recordedSyntheticRoom } from "@/domain/plan-from-measurement";
import { gapsFromSnapshot } from "./snapshot";

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
});