import type { AnalysisEscalationCounts, DamageSeverity, DamageType, ObjectCondition } from "@/domain/types";
import type { AnalysisMode } from "@/analysis/config";
import type { DetectionCluster } from "./dedupe";
import { sightingBox } from "./dedupe";
import { paddedFrameBox } from "./tiles";
import type { PreliminaryCondition, RawDetection } from "./detect";
import { cueMatches, type NarrationCue } from "./narration";

export type EscalationReason =
  | "possibly_damaged"
  | "unclear"
  | "low_confidence"
  | "narration"
  | "audit"
  | "kept_ok"
  | "strong"
  | "cheap";

export type EscalationDecision = {
  id: string;
  escalate: boolean;
  reason: EscalationReason;
};

export type ObjectConfirmation = {
  condition: ObjectCondition;
  damageTypes: DamageType[];
  severity: DamageSeverity | null;
  confidence: number;
  rationale: string;
  extentNote: string | null;
};

const RANK: Record<ObjectCondition, number> = { ok: 0, unclear: 1, damaged: 2 };
const SEVERITY: Record<string, number> = { none: 0, minor: 1, moderate: 2, severe: 3 };

/**
 * Choose which deduped objects go to the strong model.
 * Confident-ok objects stay on triage unless narration flags damage or the audit draw hits.
 */
export function planEscalation(input: {
  clusters: DetectionCluster[];
  cues: NarrationCue[];
  mode: AnalysisMode;
  threshold: number;
  auditRate: number;
  random?: () => number;
}): { decisions: EscalationDecision[]; counts: AnalysisEscalationCounts } {
  if (input.mode === "strong") {
    return {
      decisions: input.clusters.map((cluster) => ({ id: cluster.id, escalate: true, reason: "strong" })),
      counts: { mode: "strong", triaged: 0, escalated: input.clusters.length, narration: 0, audit: 0, keptOk: 0 },
    };
  }
  const random = input.random ?? Math.random;
  const decisions: EscalationDecision[] = [];
  let escalated = 0;
  let narration = 0;
  let audit = 0;
  let keptOk = 0;
  for (const cluster of input.clusters) {
    const preliminary = clusterPreliminary(cluster);
    const narrated = narrationFlagsDamage(input.cues, cluster);
    const low = cluster.confidence < input.threshold;
    let reason: EscalationReason = "kept_ok";
    let escalate = false;
    if (input.mode === "cascade") {
      if (preliminary === "possibly_damaged") reason = "possibly_damaged";
      else if (preliminary === "unclear") reason = "unclear";
      else if (low) reason = "low_confidence";
      else if (narrated) reason = "narration";
      else if (drawAudit(random, input.auditRate)) reason = "audit";
      escalate = reason !== "kept_ok";
    } else {
      reason = preliminary === "ok" && !low ? "kept_ok" : "cheap";
    }
    if (escalate) escalated += 1;
    if (escalate && narrated) narration += 1;
    if (reason === "audit") audit += 1;
    if (reason === "kept_ok") keptOk += 1;
    decisions.push({ id: cluster.id, escalate, reason });
  }
  return {
    decisions,
    counts: { mode: input.mode, triaged: input.clusters.length, escalated, narration, audit, keptOk },
  };
}

export function escalationSummary(counts: AnalysisEscalationCounts): string {
  return `${counts.mode}: ${counts.triaged} triaged, ${counts.escalated} escalated (${counts.narration} narration, ${counts.audit} audit), ${counts.keptOk} kept ok.`;
}

export function clusterPreliminary(cluster: DetectionCluster): PreliminaryCondition {
  const values = cluster.sightings.map((sighting) => sightingPreliminary(sighting));
  if (values.includes("possibly_damaged")) return "possibly_damaged";
  if (values.includes("unclear")) return "unclear";
  return "ok";
}

export function framesToConfirm(cluster: DetectionCluster): { frameId: string; box: ReturnType<typeof paddedFrameBox> }[] {
  const byFrame = new Map<string, RawDetection>();
  for (const sighting of cluster.sightings) {
    const current = byFrame.get(sighting.frameId);
    if (!current || sighting.confidence > current.confidence) byFrame.set(sighting.frameId, sighting);
  }
  return [...byFrame.values()].map((sighting) => ({
    frameId: sighting.frameId,
    box: paddedFrameBox(sightingBox(sighting)),
  }));
}

export function mergeConfirmations(items: ObjectConfirmation[]): ObjectConfirmation | null {
  if (!items.length) return null;
  const ranked = [...items].sort((a, b) => RANK[b.condition] - RANK[a.condition] || b.confidence - a.confidence);
  const top = ranked[0]!;
  const damaged = items.filter((item) => item.condition === "damaged");
  const damageTypes = [...new Set(damaged.flatMap((item) => item.damageTypes))];
  const severity = damaged.reduce<DamageSeverity | null>((best, item) => {
    if (!item.severity || item.severity === "none") return best;
    if (!best || (SEVERITY[item.severity] ?? 0) > (SEVERITY[best] ?? 0)) return item.severity;
    return best;
  }, null);
  const extentNote = items.map((item) => item.extentNote?.trim()).filter(Boolean).join(" ") || null;
  return {
    condition: top.condition,
    damageTypes: top.condition === "damaged" ? damageTypes : [],
    severity: top.condition === "damaged" ? severity ?? top.severity : top.condition === "ok" ? "none" : null,
    confidence: top.confidence,
    rationale: top.rationale,
    extentNote,
  };
}

export function applyConfirmation(cluster: DetectionCluster, confirmation: ObjectConfirmation, model: string): void {
  const rationale = [confirmation.rationale.trim(), confirmation.extentNote?.trim()].filter(Boolean).join(" ");
  for (const sighting of cluster.sightings) {
    sighting.condition = confirmation.condition;
    sighting.damageTypes = confirmation.condition === "damaged" ? [...confirmation.damageTypes] : [];
    sighting.severity = confirmation.severity;
    sighting.confidence = confirmation.confidence;
    sighting.rationale = rationale || null;
    sighting.assessedBy = model;
    sighting.confirmed = true;
  }
  cluster.confidence = confirmation.confidence;
}

/** A cascade object the strong model did not confirm. Triage damage does not become a line. */
export function applyTriageUnconfirmed(cluster: DetectionCluster, model: string): void {
  for (const sighting of cluster.sightings) {
    sighting.condition = "unclear";
    sighting.damageTypes = [];
    sighting.severity = null;
    sighting.assessedBy = model;
    sighting.confirmed = false;
  }
}

export function applyTriageKept(cluster: DetectionCluster, model: string): void {
  for (const sighting of cluster.sightings) {
    sighting.condition = "ok";
    sighting.damageTypes = [];
    sighting.severity = "none";
    sighting.assessedBy = model;
    sighting.confirmed = false;
  }
}

/** Cheap mode keeps the triage reading. `possibly_damaged` is treated as damaged. */
export function applyCheapReading(cluster: DetectionCluster, model: string): void {
  const preliminary = clusterPreliminary(cluster);
  const condition: ObjectCondition = preliminary === "possibly_damaged" ? "damaged" : preliminary;
  for (const sighting of cluster.sightings) {
    sighting.condition = condition;
    if (condition !== "damaged") {
      sighting.damageTypes = [];
      sighting.severity = condition === "ok" ? "none" : null;
    }
    sighting.assessedBy = model;
    sighting.confirmed = false;
  }
}

export function assignAssessedBy(cluster: DetectionCluster, model: string, confirmed: boolean): void {
  for (const sighting of cluster.sightings) {
    sighting.assessedBy = model;
    if (confirmed) sighting.confirmed = true;
  }
}

function sightingPreliminary(sighting: RawDetection): PreliminaryCondition {
  if (sighting.preliminary === "possibly_damaged" || sighting.preliminary === "unclear" || sighting.preliminary === "ok") {
    return sighting.preliminary;
  }
  if (sighting.condition === "damaged") return "possibly_damaged";
  if (sighting.condition === "ok") return "ok";
  return "unclear";
}

function narrationFlagsDamage(cues: NarrationCue[], cluster: DetectionCluster): boolean {
  return cues.some((cue) => {
    if (!cueMatches(cue, cluster.roomName, cluster.category, cluster.label)) return false;
    if (cue.damageTypes.length) return true;
    return /\b(damag\w*|wet|saturat\w*|moisture)\b/i.test(cue.quote);
  });
}

function drawAudit(random: () => number, rate: number): boolean {
  if (rate <= 0) return false;
  if (rate >= 1) return true;
  return random() < rate;
}
