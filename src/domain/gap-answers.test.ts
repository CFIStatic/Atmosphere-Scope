import { describe, expect, it } from "vitest";
import { moistureReadingDoesNotSetArea, softFloorScope, wallFaceFromAnswers } from "./gap-answers";

describe("gap answers", () => {
  it("multiplies wall length by height only when both exist", () => {
    expect(wallFaceFromAnswers(12, 8)).toEqual({ valueSqFt: 96, status: "estimated" });
    expect(wallFaceFromAnswers(12, null).status).toBe("unresolved");
    expect(wallFaceFromAnswers(null, 8).valueSqFt).toBeNull();
  });

  it("does not turn a moisture reading into square feet", () => {
    expect(moistureReadingDoesNotSetArea().valueSqFt).toBeNull();
  });

  it("keeps a confirmed soft floor at an unresolved quantity", () => {
    expect(softFloorScope("confirmed")).toMatchObject({ included: true, quantitySqFt: null });
    expect(softFloorScope("not_present").included).toBe(false);
    expect(softFloorScope("cant_tell").included).toBe(false);
  });
});
