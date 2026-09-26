import { createId } from "@/domain/ids";
import type { CatalogVersion } from "@/domain/catalog";
import type { FollowUpQuestion, Phase, RoomObject, ScopeClass, ScopeItem } from "@/domain/types";

const PROPOSED_AT = 0.75;

/**
 * Damaged objects become catalog lines. Unclear objects become questions.
 * Prices are not chosen here. The estimate engine prices codes it knows and
 * leaves every other code unpriced.
 */
export function scopeFromObjects(objects: RoomObject[], catalog: CatalogVersion): ScopeItem[] {
  const lines: ScopeItem[] = [];
  for (const object of objects) {
    if (object.condition !== "damaged") continue;
    for (const draft of draftsFor(object)) {
      const entry = catalog.items.find((item) => item.code === draft.code);
      if (!entry) continue;
      const proposal = proposalFor(object, draft.quantity, draft.forceSuggested);
      lines.push({
        id: createId("scp"),
        code: entry.code,
        phase: entry.category === "rebuild" ? "rebuild" : "mitigation",
        scopeClass: proposal === "proposed" ? "supported" : "conditional",
        roomId: object.roomId,
        surfaceId: null,
        findingIds: [],
        description: `${entry.description} — ${object.label}`,
        location: object.roomName,
        reason: object.assessment.rationale,
        assumptions: proposal === "suggested"
          ? ["Suggested because confidence is low, the quantity is incomplete, or the damage type does not justify replacement by itself. Accept it on the review screen before treating it as proposed."]
          : ["Proposed from the object and its evidence. The estimate is still a draft until an estimator approves the version."],
        exclusions: ["Not a certified moisture map, microbial clearance, or structural opinion."],
        dependencies: [],
        quantity: {
          value: draft.quantity,
          unit: entry.unit,
          status: draft.quantity == null ? "unresolved" : object.quantity.source === "geometry" && /within ±5%/.test(object.quantity.note) ? "confirmed" : "provisional",
          formula: draft.formula,
          sourceNote: draft.note,
          geometryRefs: [],
        },
        reviewStatus: "draft",
        humanEdited: false,
        origin: "ai",
        fingerprint: `object:${object.id}:${entry.code}`,
        objectId: object.id,
        proposal,
        confidence: object.assessment.confidence,
      });
    }
  }
  return lines;
}

export function questionsFromObjects(objects: RoomObject[]): FollowUpQuestion[] {
  return objects.filter((object) => object.condition === "unclear").map((object) => ({
    id: createId("q"),
    priority: 1,
    prompt: `Is the ${object.label} in the ${object.roomName} damaged?`,
    why: `${object.assessment.rationale} No line item was added.`,
    dependsOn: { findingIds: [], scopeItemIds: [], dimensionIds: [] },
    status: "open" as const,
    answer: null,
    answerKind: null,
    answeredAt: null,
  }));
}

type Draft = { code: string; quantity: number | null; formula: string | null; note: string; forceSuggested?: boolean };

function draftsFor(object: RoomObject): Draft[] {
  const damages = new Set(object.assessment.damageTypes);
  const stainingOnly = damages.size > 0 && [...damages].every((type) => type === "water_staining");
  if (stainingOnly) {
    return [{ code: "COND-INSPECT", quantity: 1, formula: "inspection allowance = 1", note: "Staining was recorded. It does not set a replacement quantity.", forceSuggested: true }];
  }
  const height = object.assessment.extent.heightFt ?? (object.assessment.extent.unit === "ft" ? object.assessment.extent.value : null);
  const band = object.assessment.extent.unit === "sqft" ? object.assessment.extent.value : null;
  const length = object.assessment.extent.lengthFt ?? (object.quantity.unit === "lf" ? object.quantity.value : object.assessment.extent.unit === "lf" ? object.assessment.extent.value : null);
  const lines: Draft[] = [];
  const wetBand = (object.category === "drywall" || object.category === "ceiling") && height != null && height <= 2 && length != null;
  const areaBand = (object.category === "drywall" || object.category === "ceiling") && band != null && (height == null || height <= 2) && (damages.has("wet") || damages.has("swelling") || damages.has("delamination"));
  if (wetBand || (areaBand && length != null && object.quantity.source === "narration")) {
    const lf = length;
    const sf = band ?? (height != null && lf != null ? round2(height * lf) : null);
    lines.push({ code: "MIT-FLOOD-CUT", quantity: lf, formula: "flood cut length = narrated length", note: object.assessment.extent.note });
    lines.push({ code: "REB-DRYWALL", quantity: sf, formula: "replacement area = narrated height × narrated length", note: object.assessment.extent.note });
    lines.push({ code: "REB-PAINT", quantity: sf, formula: "paint area = narrated height × narrated length", note: object.assessment.extent.note });
  } else if (object.category === "drywall" || object.category === "ceiling") {
    const sf = object.quantity.unit === "sqft" && object.quantity.source !== "geometry" ? object.quantity.value : object.assessment.extent.unit === "sqft" ? object.assessment.extent.value : null;
    if (damages.has("wet") || damages.has("swelling") || damages.has("delamination") || damages.has("missing") || damages.has("cracking") || damages.has("burn")) {
      lines.push({ code: "MIT-REMOVE-FINISH", quantity: sf, formula: sf == null ? null : "affected area", note: sf == null ? "No area was measured. Room area was not used." : object.quantity.note });
      lines.push({ code: "REB-DRYWALL", quantity: sf, formula: sf == null ? null : "matches removal", note: sf == null ? "No area was measured. Room area was not used." : object.quantity.note });
      lines.push({ code: "REB-PAINT", quantity: sf, formula: sf == null ? null : "matches removal", note: sf == null ? "No area was measured. Room area was not used." : object.quantity.note });
    }
  }
  if (object.category === "baseboard" || object.category === "trim" || object.category === "casing") {
    lines.push({ code: "MIT-DEMO-BASE", quantity: length, formula: length == null ? null : "narrated or measured length", note: length == null ? "No length was measured. The room perimeter was not used." : object.quantity.note });
    lines.push({ code: "REB-BASE", quantity: length, formula: length == null ? null : "matches removal", note: length == null ? "No length was measured. The room perimeter was not used." : object.quantity.note });
  }
  if (object.category === "flooring" && (damages.has("wet") || damages.has("swelling") || damages.has("delamination") || damages.has("missing"))) {
    const sf = object.quantity.source === "narration" && object.quantity.unit === "sqft" ? object.quantity.value : null;
    lines.push({ code: "MIT-DEMO-FLOOR", quantity: sf, formula: sf == null ? null : "narrated floor area", note: sf == null ? "No affected floor area was measured. Whole-room area was not used." : object.quantity.note });
  }
  if (damages.has("mold")) {
    const sf = object.assessment.extent.unit === "sqft" ? object.assessment.extent.value : null;
    lines.push({ code: "MIT-ANTIMICROBIAL", quantity: sf, formula: sf == null ? null : "affected area", note: "Antimicrobial treatment follows the stated extent. This is not microbial remediation or clearance.", forceSuggested: true });
  }
  if (object.category === "contents" || object.category === "furniture") {
    const replace = damages.has("missing") || object.assessment.severity === "severe";
    lines.push({
      code: replace ? "CON-REPLACE" : "CON-CLEAN",
      quantity: 1,
      formula: "count = 1",
      note: "One item after dedupe. Condition comes from the frames and narration.",
      forceSuggested: object.assessment.confidence < PROPOSED_AT,
    });
  }
  return lines;
}

function proposalFor(object: RoomObject, quantity: number | null, forceSuggested?: boolean): "proposed" | "suggested" {
  if (forceSuggested || quantity == null || object.assessment.confidence < PROPOSED_AT) return "suggested";
  return "proposed";
}

function round2(value: number): number {
  return Math.round(value * 100) / 100;
}

export function linePhase(scopeClass: ScopeClass): Phase {
  return scopeClass === "supported" ? "mitigation" : "mitigation";
}
