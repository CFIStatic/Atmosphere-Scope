import { describe, expect, it } from "vitest";
import { floorPlanFromMeasurement, recordedSyntheticRoom } from "@/domain/plan-from-measurement";
import { verifyEdgeWithTape, verifyHeightWithTape } from "./tape";

describe("tape verification", () => {
  it("locks a dimension when the tape agrees and leaves it when the tape does not", () => {
    const plan = floorPlanFromMeasurement([recordedSyntheticRoom]);
    const edge = plan.edges[0];
    const agreed = verifyEdgeWithTape(plan, edge.roomId, edge.edgeIndex, (edge.valueFt ?? 0) * 1.01);
    expect(agreed.note).toMatch(/tape/i);
    expect(agreed.plan.edges[0].status).toBe("confirmed");
    const disagreed = verifyEdgeWithTape(plan, edge.roomId, edge.edgeIndex, (edge.valueFt ?? 0) * 1.2);
    expect(disagreed.plan.edges[0].valueFt).toBe(edge.valueFt);
    expect(disagreed.plan.edges[0].status).not.toBe("confirmed");
    expect(disagreed.note).toMatch(/5%/);
  });

  it("does not invent a ceiling from an empty tape", () => {
    const plan = floorPlanFromMeasurement([recordedSyntheticRoom]);
    const roomId = plan.rooms[0].roomId;
    const before = plan.ceilingHeights[roomId]?.valueFt;
    const skipped = verifyHeightWithTape(plan, roomId, 0);
    expect(skipped.plan.ceilingHeights[roomId]?.valueFt).toBe(before);
    expect(skipped.note).toMatch(/feet/i);
  });
});
