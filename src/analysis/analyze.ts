import { createId, nowIso } from "@/domain/ids";
import type { EvidenceClass, Finding, FrameObservation, Room, TranscriptSegment, VisualFeature } from "@/domain/types";
import { screenText } from "./guard";

export type AnalysisDraft = {
  rooms: { name: string; floorName: string }[];
  findings: Omit<Finding, "id" | "createdAt" | "floorId" | "surfaceId">[];
  coverageNotes: string[];
};

const FEATURE_COPY: Partial<Record<VisualFeature, { title: string; observable: string; interpretation: string; action: string }>> = {
  standing_water: {
    title: "Standing water observed",
    observable: "Standing water is visible in the frame.",
    interpretation: "Water is present at the time of capture. Category, source, and duration are not established.",
    action: "Consider extraction of the visible water after the source is checked. Do not infer hidden saturation.",
  },
  wet_surface: {
    title: "Wet surface observed",
    observable: "The surface appears wet in the frame.",
    interpretation: "Wetness is an observation, not a map of how far moisture extends.",
    action: "Measure the wet area and confirm drying criteria before any close-up.",
  },
  staining: {
    title: "Staining observed",
    observable: "Staining is visible. The frame does not show active dripping.",
    interpretation: "Staining does not prove an active leak, mold, or that concealed materials are wet.",
    action: "Ask whether a source was identified. Do not add replacement from the stain alone.",
  },
  discoloration: {
    title: "Discoloration observed",
    observable: "Discoloration is visible.",
    interpretation: "Discoloration does not prove microbial growth.",
    action: "Qualified testing is required before any microbial scope.",
  },
  peeling_finish: {
    title: "Peeling finish observed",
    observable: "Finish is peeling or delaminating in the frame.",
    interpretation: "The failed finish is limited to what is shown.",
    action: "Measure the failed area if selective removal is considered.",
  },
  open_cavity: {
    title: "Open cavity observed",
    observable: "An opening in the assembly is visible.",
    interpretation: "The opening does not establish the condition of materials that remain concealed.",
    action: "Inspect the cavity before any hidden-damage allowance is converted to work.",
  },
  debris: {
    title: "Debris observed",
    observable: "Loose debris is visible.",
    interpretation: "Debris removal does not imply demolition of finishes.",
    action: "Include debris handling only if the estimator accepts it.",
  },
  no_visible_issue: {
    title: "No visible issue identified",
    observable: "The captured surfaces do not show a condition that supports work.",
    interpretation: "An undamaged-looking surface does not prove concealed materials are sound.",
    action: "No work currently recommended from this capture.",
  },
  obscured: {
    title: "View obscured",
    observable: "Part of the room is blocked or out of frame.",
    interpretation: "Missing corners or surfaces cannot be treated as undamaged or damaged.",
    action: "Request another capture of the obscured area.",
  },
};

export function analyzeEvidence(segments: TranscriptSegment[], frames: FrameObservation[]): AnalysisDraft {
  const screened = segments.map((segment) => ({ ...segment, injectionFlags: segment.injectionFlags.length ? segment.injectionFlags : screenText(segment.text).map((flag) => flag.id) }));
  const roomNames = new Set<string>();
  const findings: AnalysisDraft["findings"] = [];
  const coverageNotes: string[] = [];
  const roomAt = new Map<string, string>();
  let currentRoom: string | null = null;
  let currentMedia = "";
  for (const segment of [...screened].sort((a, b) => a.mediaId.localeCompare(b.mediaId) || a.startMs - b.startMs)) {
    if (segment.mediaId !== currentMedia) {
      currentMedia = segment.mediaId;
      currentRoom = null;
    }
    const announced = extractRoom(segment.text);
    if (announced) currentRoom = announced;
    if (currentRoom) {
      roomAt.set(segment.id, currentRoom);
      roomNames.add(currentRoom);
    }
    if (segment.injectionFlags.length) {
      findings.push(reportedFinding({
        roomName: currentRoom,
        title: "Narration contained instruction-like language",
        narratorReport: segment.text,
        interpretation: "Stored as reported speech. It was not applied as an instruction, price, or approval.",
        uncertainty: "Embedded instructions cannot change application rules.",
        evidenceClass: "reported_condition",
        evidence: [{ mediaId: segment.mediaId, transcriptSegmentId: segment.id, startMs: segment.startMs, endMs: segment.endMs }],
        locationNote: currentRoom ?? "Unassigned",
      }));
      coverageNotes.push(`Ignored instruction-like narration (${segment.injectionFlags.join(", ")}).`);
    }
  }

  const framesByRoom = new Map<string, FrameObservation[]>();
  for (const frame of frames) {
    const name = frame.roomHint ? titleCase(frame.roomHint) : "Unassigned";
    if (frame.roomHint) roomNames.add(titleCase(frame.roomHint));
    framesByRoom.set(name, [...(framesByRoom.get(name) ?? []), frame]);
  }

  if (roomNames.size === 0) {
    findings.push(reportedFinding({
      roomName: null,
      title: "Insufficient evidence to identify rooms",
      narratorReport: null,
      interpretation: "No room was identified in narration or frames.",
      uncertainty: "Partial results only.",
      evidenceClass: "insufficient_evidence",
      evidence: [],
      locationNote: "Property",
    }));
  }

  for (const roomName of roomNames) {
    const roomFrames = framesByRoom.get(roomName) ?? [];
    const roomSegments = screened.filter((segment) => roomAt.get(segment.id) === roomName || extractRoom(segment.text) === roomName);
    const features = new Set(roomFrames.flatMap((frame) => frame.features));
    const beats = new Set(roomFrames.flatMap((frame) => frame.coverage));
    if (!beats.has("wide")) coverageNotes.push(`${roomName}: missing a wide establishing view.`);
    if (!beats.has("ceiling") || !beats.has("floor")) coverageNotes.push(`${roomName}: ceiling or floor coverage is incomplete.`);
    if (roomFrames.length === 0) {
      findings.push(reportedFinding({
        roomName,
        title: "Insufficient visual evidence",
        narratorReport: roomSegments.map((segment) => segment.text).join(" "),
        interpretation: "Narration is reported information and was not treated as visual confirmation.",
        uncertainty: "No analyzed frames for this room.",
        evidenceClass: "insufficient_evidence",
        evidence: roomSegments.map((segment) => ({ mediaId: segment.mediaId, transcriptSegmentId: segment.id, startMs: segment.startMs })),
        locationNote: roomName,
      }));
    }
    for (const feature of ["standing_water", "wet_surface", "staining", "discoloration", "peeling_finish", "open_cavity", "debris", "no_visible_issue", "obscured"] as VisualFeature[]) {
      if (!features.has(feature)) continue;
      const copy = FEATURE_COPY[feature];
      if (!copy) continue;
      const support = roomFrames.filter((frame) => frame.features.includes(feature));
      findings.push({
        roomId: roomName,
        locationNote: roomName,
        material: null,
        evidenceClass: feature === "no_visible_issue" ? "no_visible_issue" : feature === "obscured" ? "insufficient_evidence" : "observed_condition",
        title: copy.title,
        observableCondition: copy.observable,
        narratorReport: null,
        interpretation: copy.interpretation,
        uncertainty: feature === "no_visible_issue" ? "Concealed conditions were not assessed." : "Extent may exceed the frame.",
        requiredFollowUp: feature === "staining" || feature === "discoloration" ? "Identify whether a source was found and what material is behind the finish." : null,
        proposedNextAction: copy.action,
        justification: "Included because the feature was present on an analyzed frame, separate from narration.",
        evidence: support.map((frame) => ({ mediaId: frame.mediaId, frameId: frame.id, startMs: frame.timeMs })),
        origin: "ai",
        humanCorrected: false,
        correctedFields: [],
        fingerprint: `observed:${roomName}:${feature}`,
      });
    }

    const saidMold = roomSegments.some((segment) => /mold|black growth/i.test(segment.text));
    const saidLeak = roomSegments.some((segment) => /active leak|still leaking/i.test(segment.text));
    const saidNoDamage = roomSegments.some((segment) => /no damage|looks fine|nothing wrong/i.test(segment.text) && segment.injectionFlags.length === 0);
    const saidUpgrade = roomSegments.find((segment) => /upgrade|nicer|while (?:you're|you are) here/i.test(segment.text));
    if (saidMold) {
      findings.push(reportedFinding({
        roomName,
        title: "Narrator reported mold",
        narratorReport: "The narrator used the word mold or described growth.",
        interpretation: "This is a reported condition. Visual discoloration, if any, does not confirm it.",
        uncertainty: "No laboratory or qualified test result is attached.",
        evidenceClass: "reported_condition",
        evidence: evidenceFrom(roomSegments.filter((segment) => /mold|growth/i.test(segment.text))),
        locationNote: roomName,
        fingerprint: `reported:mold:${roomName}`,
      }));
    }
    if (saidLeak && features.has("staining") && !features.has("standing_water") && !features.has("wet_surface")) {
      findings.push(reportedFinding({
        roomName,
        title: "Narration conflicts with the visible stain",
        narratorReport: "Narrator described an active leak.",
        interpretation: "Frames show staining without standing water or a wet surface. The leak claim stays reported, not observed.",
        uncertainty: "The estimator must resolve the contradiction.",
        evidenceClass: "contradiction",
        evidence: [...evidenceFrom(roomSegments.filter((segment) => /leak/i.test(segment.text))), ...roomFrames.filter((frame) => frame.features.includes("staining")).map((frame) => ({ mediaId: frame.mediaId, frameId: frame.id, startMs: frame.timeMs }))],
        locationNote: roomName,
        fingerprint: `contradiction:leak:${roomName}`,
      }));
    }
    if (saidNoDamage && [...features].some((feature) => ["staining", "standing_water", "wet_surface", "peeling_finish"].includes(feature))) {
      findings.push(reportedFinding({
        roomName,
        title: "Narration conflicts with visible conditions",
        narratorReport: "Narrator said there was no damage.",
        interpretation: "A visible condition was recorded in the same room.",
        uncertainty: "Do not drop the observation because of the narration.",
        evidenceClass: "contradiction",
        evidence: evidenceFrom(roomSegments.filter((segment) => /no damage|looks fine/i.test(segment.text))),
        locationNote: roomName,
        fingerprint: `contradiction:nodamage:${roomName}`,
      }));
    }
    if (saidUpgrade) {
      findings.push(reportedFinding({
        roomName,
        title: "Customer-requested outcome",
        narratorReport: saidUpgrade.text,
        interpretation: "A desired improvement is not a technical requirement.",
        uncertainty: "Confirm whether this is repair, replacement, or an upgrade.",
        evidenceClass: "reported_condition",
        evidence: evidenceFrom([saidUpgrade]),
        locationNote: roomName,
        fingerprint: `reported:upgrade:${roomName}`,
      }));
    }
    const lengths = narratedLengths(roomSegments, roomName);
    if (new Set(lengths).size > 1) {
      findings.push(reportedFinding({
        roomName,
        title: "Conflicting narrated dimensions",
        narratorReport: `Spoken lengths include ${lengths.join(" ft and ")} ft.`,
        interpretation: "Neither number is a confirmed measurement.",
        uncertainty: "Geometry keeps both as a conflict until someone locks a dimension.",
        evidenceClass: "contradiction",
        evidence: evidenceFrom(roomSegments),
        locationNote: roomName,
        fingerprint: `contradiction:dimension:${roomName}`,
      }));
    }
  }

  return {
    rooms: [...roomNames].map((name) => ({ name, floorName: floorOf(name, screened) })),
    findings,
    coverageNotes,
  };
}

export function materializeFindings(drafts: AnalysisDraft["findings"], rooms: Room[]): Finding[] {
  return drafts.map((draft) => {
    const room = rooms.find((item) => item.name.toLowerCase() === String(draft.roomId).toLowerCase());
    const evidenceClass = draft.evidenceClass as EvidenceClass;
    return {
      ...draft,
      id: createId("fnd"),
      roomId: room?.id ?? null,
      floorId: room?.floorId ?? null,
      surfaceId: null,
      evidenceClass,
      createdAt: nowIso(),
    };
  });
}

function reportedFinding(args: {
  roomName: string | null;
  title: string;
  narratorReport: string | null;
  interpretation: string;
  uncertainty: string;
  evidenceClass: EvidenceClass;
  evidence: Finding["evidence"];
  locationNote: string;
  fingerprint?: string;
}): AnalysisDraft["findings"][number] {
  return {
    roomId: args.roomName,
    locationNote: args.locationNote,
    material: null,
    evidenceClass: args.evidenceClass,
    title: args.title,
    observableCondition: null,
    narratorReport: args.narratorReport,
    interpretation: args.interpretation,
    uncertainty: args.uncertainty,
    requiredFollowUp: null,
    proposedNextAction: null,
    justification: "Separated from visual observations.",
    evidence: args.evidence,
    origin: "ai",
    humanCorrected: false,
    correctedFields: [],
    fingerprint: args.fingerprint ?? `reported:${args.evidenceClass}:${args.roomName}:${args.title}`,
  };
}

function evidenceFrom(segments: TranscriptSegment[]): Finding["evidence"] {
  return segments.map((segment) => ({ mediaId: segment.mediaId, transcriptSegmentId: segment.id, startMs: segment.startMs, endMs: segment.endMs }));
}

function extractRoom(text: string): string | null {
  const named = text.match(/(?:this is|we're in|we are in|entering)\s+(?:the\s+)?([a-z][a-z0-9 '/-]{1,40})/i);
  if (named) return cleanRoomName(named[1]);
  const loose = text.match(/\b(kitchen|hallway|bathroom|bath|bedroom|living room|basement|guest room|dining room)\b/i);
  return loose ? titleCase(loose[1] === "bath" ? "bathroom" : loose[1]) : null;
}

function cleanRoomName(raw: string): string {
  const cut = raw.replace(/\b(on the|about|and|with|where|which|upstairs|downstairs)\b[\s\S]*$/i, "").trim();
  return titleCase(cut);
}

function floorOf(roomName: string, segments: TranscriptSegment[]): string {
  const hit = segments.find((segment) => segment.text.toLowerCase().includes(roomName.toLowerCase()));
  if (hit && /basement/i.test(hit.text)) return "Basement";
  if (hit && /upstairs|second floor/i.test(hit.text)) return "Second floor";
  if (/basement/i.test(roomName)) return "Basement";
  return "Main floor";
}

function narratedLengths(segments: TranscriptSegment[], roomName: string): number[] {
  const values: number[] = [];
  for (const segment of segments) {
    if (segment.injectionFlags.length) continue;
    if (!segment.text.toLowerCase().includes(roomName.toLowerCase()) && extractRoom(segment.text) !== roomName) continue;
    for (const match of segment.text.matchAll(/(\d+(?:\.\d+)?)\s*(?:ft|foot|feet)\s*(?:by|x|long|wide)/gi)) {
      values.push(Number(match[1]));
    }
  }
  return values;
}

function titleCase(value: string): string {
  return value.trim().replace(/\s+/g, " ").replace(/\b\w/g, (letter) => letter.toUpperCase());
}
