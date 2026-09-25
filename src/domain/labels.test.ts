import { describe, expect, it } from "vitest";
import { dimensionLabel, jobStatusChip, priceChip } from "./labels";

describe("labels", () => {
  it("gives internal dimensions a human name", () => {
    expect(dimensionLabel("span_a")).toBe("Width");
    expect(dimensionLabel("span_b")).toBe("Depth");
    expect(dimensionLabel("height")).toBe("Height");
    expect(dimensionLabel("area")).toBe("Floor area");
  });

  it("keeps price status short and honest", () => {
    expect(priceChip("verified")).toBe("Verified");
    expect(priceChip("unpriced")).toBe("Needs price");
    expect(priceChip("unverified")).toBe("Not verified");
  });

  it("does not call a draft approved", () => {
    expect(jobStatusChip("ai_draft")).toBe("Draft");
    expect(jobStatusChip("estimator_reviewed")).toBe("Needs approval");
    expect(jobStatusChip("estimator_approved")).toBe("Needs authorization");
    expect(jobStatusChip("customer_authorized")).toBe("Authorized");
  });
});
