import { fuseDimension, type Reading, type ScaleSource } from "@/domain/fusion";
import { correctPlanEdge, correctPlanHeight, type FloorPlan } from "@/domain/plan-from-measurement";

export function verifyEdgeWithTape(plan: FloorPlan, roomId: string, edgeIndex: number, tapeFt: number): { plan: FloorPlan; note: string } {
  if (!Number.isFinite(tapeFt) || tapeFt <= 0) return { plan, note: "Enter the tape in feet." };
  const edge = plan.edges.find((item) => item.roomId === roomId && item.edgeIndex === edgeIndex);
  const fused = fuseDimension(readingsFor(edge?.valueFt ?? null, edge?.status === "imported" ? "user_reference" : "charuco", tapeFt));
  if (!fused.confirmed || fused.valueFt == null) return { plan, note: fused.note };
  return { plan: correctPlanEdge(plan, roomId, edgeIndex, fused.valueFt, true), note: fused.note };
}

export function verifyHeightWithTape(plan: FloorPlan, roomId: string, tapeFt: number): { plan: FloorPlan; note: string } {
  if (!Number.isFinite(tapeFt) || tapeFt <= 0) return { plan, note: "Enter the tape in feet." };
  const height = plan.ceilingHeights[roomId];
  const fused = fuseDimension(readingsFor(height?.valueFt ?? null, height?.provenance === "imported" ? "user_reference" : "charuco", tapeFt));
  if (!fused.confirmed || fused.valueFt == null) return { plan, note: fused.note };
  return { plan: correctPlanHeight(plan, roomId, fused.valueFt, true), note: fused.note };
}

function readingsFor(solved: number | null, source: ScaleSource, tapeFt: number): Reading[] {
  const readings: Reading[] = [];
  if (solved != null) readings.push({ source, valueFt: solved, errorPercent: 3, instrumentLock: false });
  readings.push({ source: "tape", valueFt: tapeFt, errorPercent: 1, instrumentLock: true });
  return readings;
}
