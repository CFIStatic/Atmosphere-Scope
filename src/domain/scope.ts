import { createId } from "./ids";
import { affectedArea } from "./quantities";
import type { Finding, Quantity, Room, ScopeClass, ScopeItem, Surface } from "./types";

export type ScopeDraft = Omit<ScopeItem, "id" | "reviewStatus" | "humanEdited" | "origin"> & { origin?: "ai" | "human" };

const REMOVAL_CODES = new Set(["MIT-REMOVE-FINISH"]);
const REBUILD_OF_REMOVAL: Record<string, string> = { "MIT-REMOVE-FINISH": "REB-DRYWALL" };

export function buildScope(input: {
  findings: Finding[];
  rooms: Room[];
  surfaces: Surface[];
  affectedByRoom: Record<string, { sqft: number | null; status: Quantity["status"]; note: string }>;
}): ScopeItem[] {
  const drafts: ScopeDraft[] = [];
  const roomName = (id: string | null) => input.rooms.find((room) => room.id === id)?.name ?? "Unassigned";

  const observed = (roomId: string | null, feature: string) =>
    input.findings.filter((f) => f.roomId === roomId && f.evidenceClass === "observed_condition" && (f.title + (f.observableCondition ?? "")).toLowerCase().includes(feature));

  for (const room of input.rooms) {
    const roomFindings = input.findings.filter((f) => f.roomId === room.id);
    const noIssue = roomFindings.some((f) => f.evidenceClass === "no_visible_issue" || f.evidenceClass === "no_work_recommended");
    const damageLike = roomFindings.some((f) =>
      ["observed_condition", "confirmed_test", "reported_condition", "contradiction", "insufficient_evidence"].includes(f.evidenceClass) &&
      f.evidenceClass !== "no_visible_issue",
    );
    if (noIssue && !roomFindings.some((f) => f.evidenceClass === "observed_condition" && !/no visible/i.test(f.title))) {
      drafts.push(excluded(room, "No work currently recommended", "Walkthrough did not identify a condition that supports mitigation or rebuild.", roomFindings.map((f) => f.id)));
    }

    const standing = observed(room.id, "standing water");
    const wet = observed(room.id, "wet");
    const stain = roomFindings.filter((f) => /stain|discolor/i.test(`${f.title} ${f.observableCondition ?? ""}`) && f.evidenceClass === "observed_condition");
    const peeling = observed(room.id, "peel");
    const cavity = observed(room.id, "open cavity");
    const debris = observed(room.id, "debris");
    const moldReport = roomFindings.filter((f) => /mold|microbial/i.test(`${f.narratorReport ?? ""} ${f.title}`) && f.evidenceClass !== "confirmed_test");
    const insufficient = roomFindings.filter((f) => f.evidenceClass === "insufficient_evidence");
    const extent = input.affectedByRoom[room.id] ?? { sqft: null, status: "unresolved" as const, note: "Affected area was not measured." };

    if (standing.length || wet.length || stain.length || peeling.length || cavity.length) {
      drafts.push(supportedItem({
        code: "MIT-PROTECT",
        phase: "mitigation",
        room,
        findingIds: [...standing, ...wet, ...stain, ...peeling, ...cavity].map((f) => f.id),
        description: "Floor and content protection at the work area",
        reason: "Proposed only because a condition in this room may require entry or selective work.",
        quantity: areaQty(extent, "Protection quantity follows the stated affected area, not the whole room."),
        assumptions: ["Protection limits match the affected area once it is confirmed."],
        exclusions: ["Contents manipulation beyond the immediate work area."],
        dependencies: [],
      }));
    }

    if (standing.length) {
      drafts.push(supportedItem({
        code: "MIT-EXTRACT",
        phase: "mitigation",
        room,
        findingIds: standing.map((f) => f.id),
        description: "Extract standing water",
        reason: "Standing water was recorded as an observed condition.",
        quantity: areaQty(extent, "Extraction area is the wet footprint, not total room area."),
        assumptions: ["Water category and source still require field confirmation."],
        exclusions: ["Structural drying design."],
        dependencies: ["Confirm the source is identified and stopped before drying is considered complete."],
      }));
    }

    if (wet.length) {
      drafts.push(supportedItem({
        code: "MIT-DRY",
        phase: "mitigation",
        room,
        findingIds: wet.map((f) => f.id),
        description: "Set drying equipment and record monitoring",
        reason: "A wet surface was observed. Drying is proposed only for that condition.",
        quantity: areaQty(extent, "Drying footprint follows the affected area."),
        assumptions: ["Drying goals are set by the contractor's written criteria, not by this video."],
        exclusions: ["Antimicrobial application is not included."],
        dependencies: ["Do not close the assembly until drying criteria are confirmed."],
      }));
    }

    const removalFindings = [...wet, ...peeling, ...cavity].filter((f) => f.evidenceClass === "observed_condition");
    if (removalFindings.length && extent.sqft != null) {
      drafts.push(supportedItem({
        code: "MIT-REMOVE-FINISH",
        phase: "mitigation",
        room,
        findingIds: removalFindings.map((f) => f.id),
        description: "Selectively remove affected finish",
        reason: "Removal is limited to the recorded affected area of wet, failed, or opened finish.",
        quantity: areaQty(extent, "Removal quantity is the affected area only."),
        assumptions: ["Material identity is only as confirmed on the finding."],
        exclusions: ["Removal of finishes that only show staining.", "Full-room gut."],
        dependencies: ["Stop if hazardous materials are suspected and testing is incomplete."],
      }));
      drafts.push(supportedItem({
        code: "REB-DRYWALL",
        phase: "rebuild",
        room,
        findingIds: removalFindings.map((f) => f.id),
        description: "Install and finish drywall at the removed area",
        reason: "Rebuild replaces only the finish proposed for removal. Removal itself stays on the mitigation section.",
        quantity: areaQty(extent, "Reinstall quantity matches selective removal, without a second removal charge."),
        assumptions: ["Existing assembly can receive a like finish after drying."],
        exclusions: ["Upgrade of thickness, texture, or insulation unless listed as optional."],
        dependencies: ["Start only after drying criteria are confirmed.", "Depends on MIT-REMOVE-FINISH for the same area."],
      }));
      drafts.push(supportedItem({
        code: "REB-PAINT",
        phase: "rebuild",
        room,
        findingIds: removalFindings.map((f) => f.id),
        description: "Prime and paint the repaired area",
        reason: "Paint follows the replaced finish, not staining elsewhere in the room.",
        quantity: areaQty(extent, "Paint quantity matches the repair area."),
        assumptions: ["Color match is to the existing finish as closely as practical."],
        exclusions: ["Whole-room repaint."],
        dependencies: ["Depends on drywall finish in the same area."],
      }));
    } else if (removalFindings.length && extent.sqft == null) {
      drafts.push(conditionalItem({
        code: "MIT-REMOVE-FINISH",
        phase: "mitigation",
        room,
        findingIds: removalFindings.map((f) => f.id),
        description: "Conditional selective removal — quantity unresolved",
        reason: "A failed or wet finish was observed, but the affected area is not measured.",
        quantity: areaQty(extent, "No quantity until the affected area is measured. Room area was not used."),
        assumptions: [],
        exclusions: ["Do not treat this allowance as authorization to gut the room."],
        dependencies: ["Measure the affected area before converting this to supported work."],
      }));
    }

    if (stain.length) {
      drafts.push(conditionalItem({
        code: "COND-INSPECT",
        phase: "mitigation",
        room,
        findingIds: stain.map((f) => f.id),
        description: "Qualified inspection of staining",
        reason: "Staining was observed. Appearance does not establish an active leak, mold, or a repair scope.",
        quantity: eachQty("confirmed", "One inspection allowance. Not a repair quantity."),
        assumptions: ["Inspector determines cause and whether any finish repair is justified."],
        exclusions: ["Stain-blocking paint, drywall replacement, and mold remediation are not included from video alone."],
        dependencies: [],
      }));
    }

    if (moldReport.length) {
      drafts.push({
        code: "COND-TEST-HAZMAT",
        phase: "mitigation",
        scopeClass: "excluded",
        roomId: room.id,
        surfaceId: null,
        findingIds: moldReport.map((f) => f.id),
        description: "Microbial remediation — not scoped from video",
        location: room.name,
        reason: "Narration or appearance mentioned mold or microbial growth. This application cannot confirm that and does not price remediation.",
        assumptions: [],
        exclusions: ["Any mold remediation, containment protocol, or clearance testing."],
        dependencies: ["A qualified person must test and specify abatement separately if it is required."],
        quantity: { value: null, unit: "each", status: "unresolved", formula: null, sourceNote: "No quantity. Video is not a test result.", geometryRefs: [] },
        fingerprint: `excluded:hazmat:${room.id}`,
      });
    }

    if (cavity.length) {
      drafts.push(conditionalItem({
        code: "COND-HIDDEN",
        phase: "rebuild",
        room,
        findingIds: cavity.map((f) => f.id),
        description: "Conditional allowance if concealed materials are damaged",
        reason: "An open cavity was observed. Concealed conditions were not determined from the opening alone.",
        quantity: areaQty({ sqft: null, status: "unresolved", note: "Concealed quantity is unknown." }, "Allowance stays unresolved until the cavity is inspected."),
        assumptions: ["Labeled conditional. It is not a finding that hidden damage exists."],
        exclusions: ["Do not convert this to supported work without inspection notes."],
        dependencies: ["Qualified inspection of the opened assembly."],
      }));
    }

    if (debris.length) {
      drafts.push(supportedItem({
        code: "MIT-DEBRIS",
        phase: "mitigation",
        room,
        findingIds: debris.map((f) => f.id),
        description: "Remove loose debris",
        reason: "Loose debris was observed.",
        quantity: { value: 1, unit: "each", status: "provisional", formula: "one mobilization for observed debris", sourceNote: "Count is provisional until bag count is confirmed.", geometryRefs: [] },
        assumptions: [],
        exclusions: ["Hazardous waste."],
        dependencies: [],
      }));
    }

    for (const finding of roomFindings) {
      if (/upgrade|nicer|customer (wants|requested|asked)/i.test(`${finding.narratorReport ?? ""} ${finding.title}`)) {
        drafts.push({
          code: "OPT-UPGRADE",
          phase: "rebuild",
          scopeClass: "optional",
          roomId: room.id,
          surfaceId: finding.surfaceId,
          findingIds: [finding.id],
          description: "Optional customer-requested improvement",
          location: `${room.name}: ${finding.locationNote}`,
          reason: "The narrator described a desired outcome. That request is not a confirmed technical requirement.",
          assumptions: ["Price only after the customer selects a specific product."],
          exclusions: ["Not included in the supported total."],
          dependencies: [],
          quantity: { value: 1, unit: "each", status: "provisional", formula: null, sourceNote: "Unpriced until a selection is made.", geometryRefs: [] },
          fingerprint: `optional:${room.id}:${finding.id}`,
        });
      }
    }

    if (insufficient.length && !damageLike) {
      drafts.push(excluded(room, "Insufficient evidence for scope", "Footage or narration does not support a work item.", insufficient.map((f) => f.id)));
    }
  }

  return dedupeScope(drafts).map((draft) => ({
    ...draft,
    id: createId("scp"),
    reviewStatus: "draft",
    humanEdited: false,
    origin: draft.origin ?? "ai",
  }));
}

function areaQty(extent: { sqft: number | null; status: Quantity["status"]; note: string }, sourceNote: string): Quantity {
  return affectedArea({ valueFt2: extent.sqft, status: extent.sqft == null ? "unresolved" : extent.status, sourceNote: `${sourceNote} ${extent.note}` });
}

function eachQty(status: Quantity["status"], sourceNote: string): Quantity {
  return { value: 1, unit: "each", status, formula: "allowance count = 1", sourceNote, geometryRefs: [] };
}

function supportedItem(args: Omit<ScopeDraft, "scopeClass" | "location" | "fingerprint" | "surfaceId" | "roomId"> & { room: Room }): ScopeDraft {
  return {
    ...args,
    scopeClass: "supported",
    roomId: args.room.id,
    surfaceId: null,
    location: args.room.name,
    fingerprint: `supported:${args.code}:${args.room.id}`,
  };
}

function conditionalItem(args: Omit<ScopeDraft, "scopeClass" | "location" | "fingerprint" | "surfaceId" | "roomId"> & { room: Room }): ScopeDraft {
  return {
    ...args,
    scopeClass: "conditional" as ScopeClass,
    roomId: args.room.id,
    surfaceId: null,
    location: args.room.name,
    fingerprint: `conditional:${args.code}:${args.room.id}`,
  };
}

function excluded(room: Room, description: string, reason: string, findingIds: string[]): ScopeDraft {
  return {
    code: "EXCLUDED",
    phase: "mitigation",
    scopeClass: "excluded",
    roomId: room.id,
    surfaceId: null,
    findingIds,
    description,
    location: room.name,
    reason,
    assumptions: [],
    exclusions: [description],
    dependencies: [],
    quantity: { value: 0, unit: "each", status: "confirmed", formula: "no quantity", sourceNote: "Excluded.", geometryRefs: [] },
    fingerprint: `excluded:${description}:${room.id}`,
  };
}

export function dedupeScope(items: ScopeDraft[]): ScopeDraft[] {
  const seen = new Set<string>();
  const result: ScopeDraft[] = [];
  for (const item of items) {
    if (seen.has(item.fingerprint)) continue;
    seen.add(item.fingerprint);
    if (REMOVAL_CODES.has(item.code)) {
      const twin = items.find((other) => other.code === item.code && other.roomId === item.roomId && other.phase === "rebuild");
      if (twin) continue;
    }
    result.push(item);
  }
  for (const item of result) {
    if (item.code === "REB-DRYWALL" && item.scopeClass === "supported") {
      const removal = result.find((other) => other.roomId === item.roomId && other.code === "MIT-REMOVE-FINISH");
      if (!removal) {
        item.scopeClass = "conditional";
        item.reason = `${item.reason} Held as conditional because the matching removal line is absent.`;
      }
    }
  }
  void REBUILD_OF_REMOVAL;
  return result;
}

export function scopeHasDuplicateCharges(items: ScopeItem[]): string[] {
  const problems: string[] = [];
  const groups = new Map<string, ScopeItem[]>();
  for (const item of items) {
    if (item.scopeClass === "excluded") continue;
    const key = `${item.roomId}|${item.code}|${item.description}`;
    groups.set(key, [...(groups.get(key) ?? []), item]);
  }
  for (const [key, group] of groups) {
    if (group.length > 1) problems.push(`Duplicate ${key}`);
  }
  if (items.some((item) => item.phase === "rebuild" && item.code === "MIT-REMOVE-FINISH")) {
    problems.push("Rebuild section repeats a removal charge.");
  }
  return problems;
}
