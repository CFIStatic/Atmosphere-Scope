import { describe, expect, it } from "vitest";
import { fuseDimension } from "./fusion";

describe("measurement fusion", () => {
  it("lets a tight ChArUco solve meet the target without confirming it", () => {
    const fused = fuseDimension([{ source: "charuco", valueFt: 12.02, errorPercent: 2.6, instrumentLock: false }]);
    expect(fused.meetsAccuracyTarget).toBe(true);
    expect(fused.confirmed).toBe(false);
    expect(fused.valueFt).toBe(12.02);
  });

  it("does not meet the target when the error bar is above 5%", () => {
    const fused = fuseDimension([{ source: "charuco", valueFt: 166.7, errorPercent: 5.2, instrumentLock: false }]);
    expect(fused.meetsAccuracyTarget).toBe(false);
    expect(fused.confirmed).toBe(false);
    expect(fused.ask).toMatch(/tape or laser/i);
  });

  it("refuses a door prior even when the geometry happens to be close", () => {
    const fused = fuseDimension([{ source: "door_prior", valueFt: 12.01, errorPercent: 1.2, instrumentLock: false }]);
    expect(fused.meetsAccuracyTarget).toBe(false);
    expect(fused.confirmed).toBe(false);
    expect(fused.errorPercent).toBeGreaterThanOrEqual(8);
  });

  it("does not treat an unevaluated WebXR hit as meeting ±5%", () => {
    const fused = fuseDimension([{ source: "webxr", valueFt: 12, errorPercent: 1, instrumentLock: false }]);
    expect(fused.meetsAccuracyTarget).toBe(false);
    expect(fused.confirmed).toBe(false);
    expect(fused.note).toMatch(/WebXR/);
  });

  it("confirms a tape lock when nothing else disagrees", () => {
    const fused = fuseDimension([{ source: "tape", valueFt: 14, errorPercent: 1, instrumentLock: true }]);
    expect(fused.meetsAccuracyTarget).toBe(true);
    expect(fused.confirmed).toBe(true);
  });

  it("does not confirm when the sheet and the tape disagree beyond 5%", () => {
    const fused = fuseDimension([
      { source: "charuco", valueFt: 12, errorPercent: 2.6, instrumentLock: false },
      { source: "tape", valueFt: 14, errorPercent: 1, instrumentLock: true },
    ]);
    expect(fused.meetsAccuracyTarget).toBe(false);
    expect(fused.confirmed).toBe(false);
    expect(fused.note).toMatch(/disagree/i);
    expect(fused.valueFt).toBe(14);
  });

  it("confirms a laser spot check that agrees with the sheet", () => {
    const fused = fuseDimension([
      { source: "charuco", valueFt: 8.02, errorPercent: 3.2, instrumentLock: false },
      { source: "ble_laser", valueFt: 8.1, errorPercent: 1, instrumentLock: true },
    ]);
    expect(fused.meetsAccuracyTarget).toBe(true);
    expect(fused.confirmed).toBe(true);
    expect(fused.sources).toContain("ble_laser");
  });

  it("leaves a typed reference unconfirmed and over the target until it is locked as a tape", () => {
    const typed = fuseDimension([{ source: "user_reference", valueFt: 10, errorPercent: 0, instrumentLock: false }]);
    expect(typed.meetsAccuracyTarget).toBe(false);
    expect(typed.confirmed).toBe(false);
  });

  it("stays unresolved with no anchor", () => {
    const fused = fuseDimension([{ source: "none", valueFt: null, errorPercent: null, instrumentLock: false }]);
    expect(fused.valueFt).toBeNull();
    expect(fused.meetsAccuracyTarget).toBe(false);
    expect(fused.confirmed).toBe(false);
  });
});
