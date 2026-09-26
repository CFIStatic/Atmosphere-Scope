import { createId, nowIso } from "@/domain/ids";
import { DEMO_PRICE_BOOK, emptyPriceBook } from "@/domain/price-book";
import { buildQuestions } from "@/domain/questions";
import { createEstimateVersion } from "@/domain/review";
import { buildScope } from "@/domain/scope";
import type { AnalysisCostLog, Finding, FrameObservation, Job, MediaAsset, PriceBook, ProcessingStage, ProcessingState, Room, TranscriptSegment } from "@/domain/types";
import { SKETCH_DISCLAIMER } from "@/domain/types";
import { applyEvaluation, boundsOf, emptySnapshot } from "@/domain/geometry";
import { STARTER_CATALOG } from "@/domain/catalog";
import { analyzeEvidence, materializeFindings } from "./analyze";
import { layoutFromMentions, mentionRooms } from "./layout";
import { screenText } from "./guard";
import { analyzeObjects, questionsFromObjects, scopeFromObjects, type RawDetection, type RoomMeasure } from "./objects/run";

export const STAGE_ORDER: ProcessingStage[] = ["ingest", "transcribe", "frames", "analyze", "layout", "questions", "scope", "estimate"];

export function initialProcessing(): ProcessingState {
  return {
    status: "idle",
    runId: null,
    lastError: null,
    stages: {
      ingest: pending(),
      transcribe: pending(),
      frames: pending(),
      analyze: pending(),
      layout: pending(),
      questions: pending(),
      scope: pending(),
      estimate: pending(),
    },
  };
}

function pending() {
  return { status: "pending" as const, completedAt: null, message: null };
}

export function createEmptyJob(input: {
  address: string;
  city: string;
  region: string;
  postalCode: string;
  customerName: string;
  phone: string;
  email: string;
  concern: string;
}): Job {
  const id = createId("job");
  const floorId = createId("flr");
  return {
    id,
    createdAt: nowIso(),
    updatedAt: nowIso(),
    property: { address: input.address, city: input.city, region: input.region, postalCode: input.postalCode, propertyType: "residential_interior" },
    customer: { name: input.customerName, phone: input.phone, email: input.email },
    concern: input.concern,
    floors: [{ id: floorId, name: "Main floor", level: 1 }],
    rooms: [],
    surfaces: [],
    media: [],
    transcripts: [],
    frames: [],
    findings: [],
    objects: [],
    analysisCost: null,
    sketch: applyEvaluation({
      id: createId("sketch"),
      units: "ft",
      state: "provisional_layout",
      scaleClaim: "not_to_scale",
      scaleClaimReason: "No geometry yet.",
      ceilingHeights: {},
      geometry: emptySnapshot(),
      undo: [],
      redo: [],
      disclaimer: SKETCH_DISCLAIMER,
    }),
    questions: [],
    scopeItems: [],
    estimates: [],
    activeEstimateId: null,
    pendingQuantityChanges: [],
    processing: initialProcessing(),
    audit: [{ id: createId("aud"), at: nowIso(), actor: { name: "System", role: "system" }, action: "job_created", detail: "Residential interior job opened." }],
    coverageNotes: [],
  };
}

export type PipelineInput = {
  media: MediaAsset[];
  transcripts: TranscriptSegment[];
  frames: FrameObservation[];
  failStage?: ProcessingStage;
  priceBook?: PriceBook | null;
  usePriceBook: boolean;
  /** Per-frame inventory. Absent means keep objects already stored on the job. */
  detections?: RawDetection[];
  measures?: RoomMeasure[];
  analysisCost?: AnalysisCostLog | null;
};

export function runPipeline(job: Job, input: PipelineInput): Job {
  const runId = createId("run");
  let next: Job = {
    ...job,
    media: mergeMedia(job.media, input.media),
    processing: { ...initialProcessing(), status: "running", runId },
    updatedAt: nowIso(),
  };
  try {
    next = stage(next, "ingest", () => next, "Media registered.");
    if (input.failStage === "ingest") throw new Error("Ingest interrupted.");
    next = stage(next, "transcribe", () => {
      const transcripts = input.transcripts.map((segment) => {
        const flags = screenText(segment.text).map((flag) => flag.id);
        return { ...segment, injectionFlags: [...new Set([...segment.injectionFlags, ...flags])] };
      });
      return { ...next, transcripts };
    }, input.transcripts.length ? "Transcript stored as evidence." : "No transcript supplied. Narration was not invented.");
    if (input.failStage === "transcribe") throw new Error("Transcription failed.");
    next = stage(next, "frames", () => ({ ...next, frames: input.frames }), input.frames.length ? "Frame notes stored separately from narration." : "No frame analysis available. Visual findings were not invented.");
    if (input.failStage === "frames") throw new Error("Frame analysis interrupted.");
    const draft = analyzeEvidence(next.transcripts, next.frames);
    next = stage(next, "analyze", () => {
      const floors = mergeFloors(next, draft.rooms.map((room) => room.floorName));
      const rooms = mergeRooms(next, draft.rooms, floors);
      const findings = mergeFindings(next.findings, materializeFindings(draft.findings, rooms));
      return { ...next, floors, rooms, findings, coverageNotes: draft.coverageNotes };
    }, "Findings drafted. Human corrections kept.");
    if (input.failStage === "analyze") throw new Error("Analysis failed.");
    if (input.detections?.length) {
      const analyzed = analyzeObjects({
        detections: input.detections,
        transcripts: next.transcripts,
        rooms: next.rooms,
        measures: input.measures,
        catalog: STARTER_CATALOG,
      });
      next = { ...next, objects: analyzed.objects };
    }
    if ("analysisCost" in input) next = { ...next, analysisCost: input.analysisCost ?? null };
    next = stage(next, "layout", () => layoutStage(next), "Schematic layout proposed. Narrated sizes are not locked measurements.");
    if (input.failStage === "layout") throw new Error("Layout interrupted.");
    const book = input.usePriceBook ? input.priceBook ?? DEMO_PRICE_BOOK : emptyPriceBook();
    next = stage(next, "scope", () => {
      const generated = buildScope({
        findings: next.findings,
        rooms: next.rooms,
        surfaces: next.surfaces,
        affectedByRoom: Object.fromEntries(next.rooms.map((room) => [room.id, { sqft: null, status: "unresolved" as const, note: "Affected area not measured during analysis." }])),
      });
      const objectLines = scopeFromObjects(next.objects ?? [], STARTER_CATALOG);
      return { ...next, scopeItems: mergeScope(next.scopeItems, [...generated, ...objectLines]) };
    }, "Scope separated into supported, conditional, optional, and excluded work.");
    if (input.failStage === "scope") throw new Error("Scope generation failed.");
    next = stage(next, "questions", () => ({ ...next, questions: mergeQuestions(next.questions, [...buildQuestions({ findings: next.findings, scopeItems: next.scopeItems, sketch: next.sketch }), ...questionsFromObjects(next.objects ?? [])]) }), "Follow-up questions listed.");
    const locked = next.estimates.find((version) => version.status === "estimator_approved" || version.status === "customer_authorized");
    next = stage(next, "estimate", () => {
      if (locked) {
        const revision = createEstimateVersion({
          job: next,
          items: next.scopeItems,
          book,
          actor: { name: "Atmosphere analysis", role: "ai" },
          parentVersionId: locked.id,
          changeRequest: "New analysis after approval. Previous authorized or approved version was not overwritten.",
        });
        return {
          ...next,
          estimates: next.estimates.map((version) => (version.id === locked.id ? version : version)).concat(revision),
          activeEstimateId: revision.id,
          audit: [...next.audit, audit("change_request", `Draft revision ${revision.number} opened beside version ${locked.number}.`)],
        };
      }
      const version = createEstimateVersion({
        job: { ...next, estimates: next.estimates.filter((item) => item.status !== "ai_draft") },
        items: next.scopeItems,
        book,
        actor: { name: "Atmosphere analysis", role: "ai" },
      });
      const estimates = [...next.estimates.filter((item) => item.status !== "ai_draft"), version];
      return { ...next, estimates, activeEstimateId: version.id };
    }, book.items.length ? "Draft estimate priced from the selected book." : "Unpriced scope. No price book was applied.");
    next.processing = { ...next.processing, status: next.coverageNotes.length ? "partial" : "complete" };
    next.audit = [...next.audit, audit("pipeline_complete", next.processing.status === "partial" ? "Completed with coverage gaps." : "Completed.")];
    next.updatedAt = nowIso();
    return next;
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unknown processing error";
    const stages = input.failStage
      ? { ...next.processing.stages, [input.failStage]: { status: "failed" as const, completedAt: null, message } }
      : next.processing.stages;
    next.processing = { ...next.processing, status: "failed", lastError: message, stages };
    next.audit = [...next.audit, audit("pipeline_failed", message)];
    next.updatedAt = nowIso();
    return next;
  }
}

function stage(job: Job, name: ProcessingStage, apply: () => Job, message: string): Job {
  const updated = apply();
  return {
    ...updated,
    processing: {
      ...updated.processing,
      stages: { ...updated.processing.stages, [name]: { status: "complete", completedAt: nowIso(), message } },
    },
  };
}

function mergeMedia(existing: MediaAsset[], incoming: MediaAsset[]): MediaAsset[] {
  const ids = new Set(existing.map((item) => item.id));
  return [...existing, ...incoming.filter((item) => !ids.has(item.id))];
}

function mergeFloors(job: Job, names: string[]): Job["floors"] {
  const floors = [...job.floors];
  for (const name of names) {
    if (!floors.some((floor) => floor.name === name)) {
      floors.push({ id: createId("flr"), name, level: floors.length });
    }
  }
  return floors;
}

function mergeRooms(job: Job, incoming: { name: string; floorName: string }[], floors: Job["floors"]): Room[] {
  const rooms = [...job.rooms];
  for (const item of incoming) {
    const existing = rooms.find((room) => room.name.toLowerCase() === item.name.toLowerCase());
    if (existing) continue;
    const floor = floors.find((entry) => entry.name === item.floorName) ?? floors[0];
    rooms.push({ id: createId("room"), floorId: floor.id, name: item.name, nameStatus: "inferred", humanNamed: false, notes: "" });
  }
  return rooms;
}

export function mergeFindings(existing: Finding[], incoming: Finding[]): Finding[] {
  const kept = existing.filter((finding) => finding.humanCorrected);
  const fingerprints = new Set(kept.map((finding) => finding.fingerprint));
  const fresh = incoming.filter((finding) => !fingerprints.has(finding.fingerprint));
  const untouched = existing.filter((finding) => !finding.humanCorrected && !incoming.some((item) => item.fingerprint === finding.fingerprint));
  return [...kept, ...fresh.filter((finding) => !untouched.some((item) => item.fingerprint === finding.fingerprint)), ...untouched.filter((finding) => finding.origin === "human")];
}

function mergeScope(existing: Job["scopeItems"], incoming: Job["scopeItems"]): Job["scopeItems"] {
  const human = existing.filter((item) => item.humanEdited);
  const fps = new Set(human.map((item) => item.fingerprint));
  return [...human, ...incoming.filter((item) => !fps.has(item.fingerprint))];
}

function mergeQuestions(existing: Job["questions"], incoming: Job["questions"]): Job["questions"] {
  const answered = existing.filter((question) => question.status !== "open");
  const prompts = new Set(answered.map((question) => question.prompt));
  return [...answered, ...incoming.filter((question) => !prompts.has(question.prompt))];
}

function layoutStage(job: Job): Job {
  const mentions = mentionRooms(job.transcripts, job.frames);
  if (!anchoredSketch(job)) return { ...job, sketch: layoutFromMentions(job.rooms, mentions, job.frames) };
  const present = new Set(job.sketch.geometry.rooms.map((room) => room.roomId));
  const missing = job.rooms.filter((room) => !present.has(room.id));
  if (missing.length === 0) {
    return { ...job, audit: [...job.audit, audit("layout_preserved", "Existing human-corrected sketch was kept.")] };
  }
  const generated = layoutFromMentions(missing, mentions, job.frames);
  const shiftX = boundsOf(job.sketch.geometry.rooms).maxX + 1.5;
  const sketch = applyEvaluation({
    ...job.sketch,
    ceilingHeights: { ...job.sketch.ceilingHeights, ...generated.ceilingHeights },
    geometry: {
      rooms: [
        ...job.sketch.geometry.rooms,
        ...generated.geometry.rooms.map((room) => ({ ...room, polygon: room.polygon.map((point) => ({ x: point.x + shiftX, y: point.y })) })),
      ],
      openings: [...job.sketch.geometry.openings, ...generated.geometry.openings],
      fixtures: [...job.sketch.geometry.fixtures, ...generated.geometry.fixtures],
      annotations: [...job.sketch.geometry.annotations, ...generated.geometry.annotations],
      dimensions: [...job.sketch.geometry.dimensions, ...generated.geometry.dimensions],
    },
  });
  return { ...job, sketch, audit: [...job.audit, audit("layout_preserved", "Existing imported or human-corrected geometry was kept. New rooms were added beside it.")] };
}

function anchoredSketch(job: Job): boolean {
  if (!job.sketch.geometry.rooms.length) return false;
  return job.sketch.geometry.dimensions.some((dimension) => dimension.locked)
    || job.sketch.geometry.rooms.some((room) => room.provenance === "imported" || room.provenance === "user_corrected" || room.provenance === "confirmed");
}

function audit(action: string, detail: string) {
  return { id: createId("aud"), at: nowIso(), actor: { name: "Atmosphere analysis", role: "ai" as const }, action, detail };
}

export function retryPipeline(job: Job, input: PipelineInput): Job {
  if (job.processing.status !== "failed") return runPipeline(job, input);
  return runPipeline({ ...job, processing: initialProcessing() }, input);
}
