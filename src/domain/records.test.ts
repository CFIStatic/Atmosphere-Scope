import { describe, expect, it } from "vitest";
import { floorPlanFromMeasurement, recordedSyntheticRoom } from "@/domain/plan-from-measurement";
import { approveRecord, authorizeRecord, openRecord, saveRecord } from "./records";
import type { WalkthroughSnapshot } from "@/capture/snapshot";
import type { EstimateReport } from "./estimate-engine";

const plan = floorPlanFromMeasurement([recordedSyntheticRoom]);

function snapshot(report: EstimateReport | null = null): WalkthroughSnapshot {
  return {
    savedAt: "2026-09-25T00:00:00.000Z",
    source: "measurement",
    transcript: null,
    transcriptNote: "Test.",
    plan,
    objects: [],
    offers: [],
    finalReport: report,
  };
}

const report: EstimateReport = {
  schema: "atmosphere.estimate.v1",
  id: "est_1:final:t",
  createdAt: "2026-09-25T00:00:00.000Z",
  status: "final",
  catalogVersionId: "catalog-starter-1",
  rateBookId: "rates-2",
  region: "Unspecified",
  settings: { overheadPercent: 0.1, profitPercent: 0.1, taxPercent: 0, taxBase: "none" },
  lines: [],
  pricedTotal: null,
  unpricedCount: 0,
  note: "Final.",
};

describe("walkthrough approval", () => {
  it("locks numbers on estimator approval and keeps customer sign-off separate", () => {
    const open = openRecord("w1", snapshot(report), "walkthroughs/v", "t0");
    expect(() => approveRecord(openRecord("w1", snapshot(null), null, "t0"), "Ada", "t1")).toThrow(/Finalize/);
    const approved = approveRecord(open, "Ada", "t1");
    expect(approved.approval.status).toBe("estimator_approved");
    expect(approved.approval.authorizedBy).toBeNull();
    const changed = snapshot(report);
    changed.plan = { ...changed.plan, quantities: changed.plan.quantities.map((item) => ({ ...item, value: 1 })) };
    expect(() => saveRecord(approved, changed, approved.videoKey, "t2")).toThrow(/locked/);
    expect(() => authorizeRecord(approved, "Ada", "I accept this version.", "t2")).not.toThrow();
    const signed = authorizeRecord(approved, "Pat", "I accept this version.", "t2");
    expect(signed.approval.status).toBe("customer_authorized");
    expect(signed.approval.approvedBy).toBe("Ada");
    expect(signed.snapshot.finalReport?.rateBookId).toBe("rates-2");
    expect(() => authorizeRecord(open, "Pat", "I accept this version.", "t2")).toThrow(/follows estimator approval/);
  });
});
