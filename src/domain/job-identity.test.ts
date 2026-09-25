import { describe, expect, it } from "vitest";
import { createEmptyJob } from "@/analysis/pipeline";
import { applyJobIdentity, draftJobInput, suggestFromNarration } from "./job-identity";

describe("draft job identity", () => {
  it("opens a draft without inventing a street", () => {
    const input = draftJobInput();
    expect(input.address).toBe("");
    expect(input.city).toBe("");
    expect(input.customerName).toBe("Untitled");
    const job = createEmptyJob(input);
    expect(job.property.address).toBe("");
  });

  it("suggests a name or address only when the narration says one", () => {
    expect(suggestFromNarration(null)).toEqual({ name: null, address: null });
    expect(suggestFromNarration("Water in the kitchen.")).toEqual({ name: null, address: null });
    expect(suggestFromNarration("We are at 418 Maple Street. The ceiling is stained.")).toEqual({
      name: null,
      address: "418 Maple Street",
    });
    expect(suggestFromNarration("The job is called Birch water.")).toEqual({
      name: "Birch water",
      address: null,
    });
  });

  it("stores coordinates as a location note and leaves the address alone", () => {
    const job = createEmptyJob(draftJobInput());
    const located = applyJobIdentity(job, { location: { lat: 43.07305, lng: -89.40123 } });
    expect(located.property.address).toBe("");
    expect(located.coverageNotes.join(" ")).toMatch(/43\.07305, -89\.40123/);
    const named = applyJobIdentity(located, { address: "22 Birch Lane", customerName: "R. Patel" });
    expect(named.property.address).toBe("22 Birch Lane");
    expect(named.customer.name).toBe("R. Patel");
    expect(named.property.address).not.toMatch(/43\.07305/);
  });
});
