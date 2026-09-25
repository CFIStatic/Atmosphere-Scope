import type { IdentifiedObject } from "@/analysis/frames";
import type { AssistState } from "@/domain/assist";
import type { EstimateReport } from "@/domain/estimate-engine";
import type { FloorPlan } from "@/domain/plan-from-measurement";
import type { ResultOffer } from "@/domain/results";

export const WALKTHROUGH_KEY = "atmosphere-walkthrough";

export type PlanCrossCheck = {
  room: string;
  item: string;
  imported: number | null;
  video: number | null;
  note: string;
};

export type WalkthroughSnapshot = {
  savedAt: string;
  source: "measurement" | "recorded-preview" | "import";
  transcript: string | null;
  transcriptNote: string;
  plan: FloorPlan;
  videoPlan?: FloorPlan | null;
  importNotes?: string[];
  crossCheck?: PlanCrossCheck[];
  objects: IdentifiedObject[];
  offers: ResultOffer[];
  finalReport?: EstimateReport | null;
  videoKey?: string | null;
  recordId?: string | null;
  assist?: AssistState;
};

export function gapsFromSnapshot(snapshot: WalkthroughSnapshot): string[] {
  const gaps: string[] = [];
  for (const edge of snapshot.plan.edges) {
    const room = snapshot.plan.names[edge.roomId] ?? edge.roomId;
    if (edge.status === "unmeasured") gaps.push(`${room} wall ${edge.edgeIndex + 1} is unmeasured.`);
    if (edge.status === "estimated") gaps.push(`${room} wall ${edge.edgeIndex + 1} is estimated, not confirmed.`);
  }
  for (const [roomId, height] of Object.entries(snapshot.plan.ceilingHeights)) {
    if (height.status === "confirmed" || height.provenance === "imported") continue;
    gaps.push(`${snapshot.plan.names[roomId] ?? roomId} ceiling height is ${height.status === "unresolved" ? "unmeasured" : "estimated"}.`);
  }
  for (const note of snapshot.plan.annotations) gaps.push(note.text);
  return gaps;
}

export function saveWalkthrough(snapshot: WalkthroughSnapshot): void {
  if (typeof localStorage === "undefined") return;
  const previous = loadWalkthrough();
  const next: WalkthroughSnapshot = {
    ...snapshot,
    finalReport: snapshot.finalReport ?? previous?.finalReport ?? null,
    recordId: snapshot.recordId ?? previous?.recordId ?? null,
    videoKey: snapshot.videoKey ?? previous?.videoKey ?? null,
  };
  localStorage.setItem(WALKTHROUGH_KEY, JSON.stringify(next));
}

export function loadWalkthrough(): WalkthroughSnapshot | null {
  if (typeof localStorage === "undefined") return null;
  const raw = localStorage.getItem(WALKTHROUGH_KEY);
  if (!raw) return null;
  try {
    const parsed = JSON.parse(raw) as WalkthroughSnapshot;
    if (!parsed?.plan?.rooms || !Array.isArray(parsed.plan.quantities)) return null;
    return parsed;
  } catch {
    return null;
  }
}
