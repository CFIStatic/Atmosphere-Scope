import { createId, nowIso } from "./ids";
import { answerQuestion, buildQuestions } from "./questions";
import { editBlocked } from "@/auth/access";
import { activeEstimate, approveEstimate, authorizeEstimate, createEstimateVersion, markReviewed, proposalChangesRequireRevision } from "./review";
import { applySketchOp, previewQuantityChanges, rectangleRoom, redoSketch, undoSketch, type SketchOp } from "./sketch-ops";
import { boundsOf } from "./geometry";
import { priceAll } from "./pricing";
import { DEMO_PRICE_BOOK } from "./price-book";
import type { Actor, Job, PricingSettings, ScopeItem } from "./types";
import { runPipeline, retryPipeline } from "@/analysis/pipeline";
import type { FrameObservation, TranscriptSegment } from "./types";

export type JobAction =
  | { type: "sketch"; op: SketchOp }
  | { type: "undo" }
  | { type: "redo" }
  | { type: "preview_quantities" }
  | { type: "apply_quantities" }
  | { type: "answer"; questionId: string; answer: string; kind: "text" | "measurement" | "photo" | "test" }
  | { type: "correct_finding"; findingId: string; title: string; interpretation: string }
  | { type: "edit_scope"; itemId: string; description?: string; quantityValue?: number | null; assumptions?: string }
  | { type: "settings"; settings: PricingSettings }
  | { type: "mark_reviewed"; actorName: string }
  | { type: "approve"; actorName: string }
  | { type: "authorize"; actorName: string; statement: string }
  | { type: "process"; transcript: string; mediaId?: string; usePriceBook: boolean; frames?: FrameObservation[] }
  | { type: "retry" }
  | { type: "set_affected"; roomId: string; sqft: number | null; note: string }
  | { type: "add_named_room"; name: string }
  | { type: "accept_line"; itemId: string };

export function applyJobAction(job: Job, action: JobAction): Job {
  const locked = editBlocked(action.type, activeEstimate(job)?.status ?? null);
  if (locked) throw new Error(locked);
  const actor = (name: string, role: Actor["role"]): Actor => ({ name, role });
  if (action.type === "sketch") {
    const sketch = applySketchOp(job.sketch, action.op);
    const rooms = roomsAfterSketch(job, action.op, sketch);
    const pending = previewQuantityChanges({ ...job, rooms, sketch });
    return audit({ ...job, rooms, sketch, pendingQuantityChanges: pending }, "sketch_edit", "Sketch edited. Quantity changes are previewed, not applied.");
  }
  if (action.type === "undo") return { ...job, sketch: undoSketch(job.sketch), pendingQuantityChanges: previewQuantityChanges({ ...job, sketch: undoSketch(job.sketch) }) };
  if (action.type === "redo") return { ...job, sketch: redoSketch(job.sketch) };
  if (action.type === "preview_quantities") return { ...job, pendingQuantityChanges: previewQuantityChanges(job) };
  if (action.type === "apply_quantities") return applyQuantityChanges(job);
  if (action.type === "answer") {
    return audit({
      ...job,
      questions: job.questions.map((question) => question.id === action.questionId ? answerQuestion(question, action.answer, action.kind) : question),
    }, "question_answered", "Answer stored. Accepted sketch edits were not overwritten.");
  }
  if (action.type === "correct_finding") {
    return audit({
      ...job,
      findings: job.findings.map((finding) => finding.id === action.findingId ? { ...finding, title: action.title, interpretation: action.interpretation, humanCorrected: true, origin: "human", correctedFields: [...new Set([...finding.correctedFields, "title", "interpretation"])] } : finding),
    }, "finding_corrected", "Human correction marked separately from the AI draft.");
  }
  if (action.type === "edit_scope") return editScope(job, action);
  if (action.type === "settings") return reprice(job, action.settings, "Pricing settings updated on the draft.");
  if (action.type === "mark_reviewed") {
    const current = requireDraft(job);
    const reviewed = markReviewed(current, actor(action.actorName, "estimator"));
    return replaceVersion(job, reviewed, "estimator_reviewed");
  }
  if (action.type === "approve") {
    const current = activeEstimate(job);
    if (!current) throw new Error("No estimate to approve.");
    const approved = approveEstimate(current, actor(action.actorName, "estimator"));
    return replaceVersion(job, approved, "estimator_approved");
  }
  if (action.type === "authorize") {
    const current = activeEstimate(job);
    if (!current) throw new Error("No estimate to authorize.");
    const authorized = authorizeEstimate(current, actor(action.actorName, "customer"), action.statement);
    return replaceVersion(job, authorized, "customer_authorized");
  }
  if (action.type === "retry") {
    return retryPipeline(job, { media: job.media, transcripts: job.transcripts, frames: job.frames, usePriceBook: job.estimates.at(-1)?.priceBookId !== "none" });
  }
  if (action.type === "process") return processSupplied(job, action);
  if (action.type === "set_affected") return setAffected(job, action.roomId, action.sqft, action.note);
  if (action.type === "add_named_room") return addNamedRoom(job, action.name);
  if (action.type === "accept_line") return acceptLine(job, action.itemId);
  return job;
}

function applyQuantityChanges(job: Job): Job {
  if (job.pendingQuantityChanges.length === 0) return job;
  const items = job.scopeItems.map((item) => {
    const change = job.pendingQuantityChanges.find((entry) => entry.scopeItemId === item.id);
    if (!change || item.humanEdited) return item;
    return { ...item, quantity: change.proposed };
  });
  const current = activeEstimate(job);
  if (proposalChangesRequireRevision(current)) {
    const book = DEMO_PRICE_BOOK;
    const revision = createEstimateVersion({
      job: { ...job, scopeItems: items },
      items,
      book,
      actor: { name: "Estimator", role: "estimator" },
      parentVersionId: current?.id,
      changeRequest: "Geometry changed after approval. Quantities were not written onto the approved version.",
    });
    return audit({ ...job, scopeItems: items, estimates: [...job.estimates, revision], activeEstimateId: revision.id, pendingQuantityChanges: [] }, "change_request", revision.changeRequest ?? "Revision opened.");
  }
  return reprice({ ...job, scopeItems: items, pendingQuantityChanges: [] }, current?.settings ?? job.estimates.at(-1)?.settings, "Previewed quantities applied to the draft.");
}

function editScope(job: Job, action: Extract<JobAction, { type: "edit_scope" }>): Job {
  const current = activeEstimate(job);
  if (current && proposalChangesRequireRevision(current)) {
    throw new Error("This version is approved. Edits open a revision instead of changing it. Apply a geometry preview or add a note via a new draft.");
  }
  const items = job.scopeItems.map((item) => {
    if (item.id !== action.itemId) return item;
    const quantity = action.quantityValue === undefined ? item.quantity : { ...item.quantity, value: action.quantityValue, status: action.quantityValue == null ? "unresolved" as const : "confirmed" as const, sourceNote: "Estimator entered this quantity.", formula: item.quantity.formula };
    return {
      ...item,
      description: action.description ?? item.description,
      assumptions: action.assumptions ? action.assumptions.split("\n").filter(Boolean) : item.assumptions,
      quantity,
      humanEdited: true,
      reviewStatus: "edited" as const,
      origin: "human" as const,
    };
  });
  return reprice({ ...job, scopeItems: items }, current?.settings, "Estimator edited a line. The approved history is unchanged because this draft was still open.");
}

function setAffected(job: Job, roomId: string, sqft: number | null, note: string): Job {
  const items = job.scopeItems.map((item) => {
    if (item.roomId !== roomId || item.humanEdited) return item;
    if (!/affected|removal|drywall|paint|extract|drying|protection/i.test(item.description)) return item;
    return {
      ...item,
      quantity: {
        ...item.quantity,
        value: sqft,
        status: sqft == null ? "unresolved" as const : "confirmed" as const,
        sourceNote: `${note} Affected area only — room area was not substituted.`,
        formula: "estimator-entered affected area",
      },
    };
  });
  const questions = buildQuestions({ findings: job.findings, scopeItems: items, sketch: job.sketch });
  return reprice({ ...job, scopeItems: items, questions: questions.length ? questions : job.questions }, activeEstimate(job)?.settings, "Affected area recorded without replacing room area.");
}

function processSupplied(job: Job, action: Extract<JobAction, { type: "process" }>): Job {
  const mediaId = action.mediaId ?? job.media.at(-1)?.id ?? createId("med");
  const media = job.media.some((item) => item.id === mediaId) ? job.media : [...job.media, { id: mediaId, kind: "video" as const, filename: "narration.txt", mimeType: "text/plain", byteSize: action.transcript.length, storageKey: null, roomId: null, label: "Supplied narration", createdAt: nowIso() }];
  const segments: TranscriptSegment[] = action.transcript.trim()
    ? action.transcript.split(/\n+/).filter(Boolean).map((text, index) => ({
        id: createId("seg"),
        mediaId,
        startMs: index * 5000,
        endMs: index * 5000 + 4500,
        text,
        speaker: "narrator" as const,
        injectionFlags: [],
        source: "user_supplied" as const,
      }))
    : [];
  return runPipeline({ ...job, media }, { media, transcripts: [...job.transcripts, ...segments], frames: [...job.frames, ...(action.frames ?? [])], usePriceBook: action.usePriceBook });
}

function reprice(job: Job, settings: PricingSettings | undefined, detail: string): Job {
  const current = activeEstimate(job);
  if (!current || proposalChangesRequireRevision(current)) return audit(job, "noop", detail);
  const priced = priceAll(job.scopeItems, DEMO_PRICE_BOOK, settings ?? current.settings);
  const version = { ...current, scopeItemIds: job.scopeItems.map((item) => item.id), pricedLines: priced.lines, totals: priced.totals, settings: settings ?? current.settings };
  return audit(replaceVersion(job, version, detail), "estimate_updated", detail);
}

function replaceVersion(job: Job, version: Job["estimates"][number], detail: string): Job {
  return audit({
    ...job,
    estimates: job.estimates.map((item) => (item.id === version.id ? version : item)),
    activeEstimateId: version.id,
  }, version.status, detail);
}

function roomsAfterSketch(job: Job, op: SketchOp, sketch: Job["sketch"]): Job["rooms"] {
  if (op.type !== "split_room") return job.rooms;
  if (job.rooms.some((room) => room.id === op.newRoomId)) return job.rooms;
  if (!sketch.geometry.rooms.some((room) => room.roomId === op.newRoomId)) return job.rooms;
  const source = job.rooms.find((room) => room.id === op.roomId);
  const floorId = source?.floorId ?? job.floors[0]?.id;
  if (!floorId) return job.rooms;
  return [...job.rooms, { id: op.newRoomId, floorId, name: source ? `${source.name} split` : "Split room", nameStatus: "confirmed", humanNamed: true, notes: "" }];
}

function addNamedRoom(job: Job, name: string): Job {
  const roomId = createId("room");
  const floor = job.floors[0];
  const box = boundsOf(job.sketch.geometry.rooms);
  const sketch = applySketchOp(job.sketch, { type: "add_room", roomId, polygon: rectangleRoom(box.maxX + 2, box.minY, 10, 8), provenance: "user_corrected" });
  return audit({
    ...job,
    rooms: [...job.rooms, { id: roomId, floorId: floor.id, name: name.trim() || "New room", nameStatus: "confirmed", humanNamed: true, notes: "" }],
    sketch,
    pendingQuantityChanges: previewQuantityChanges({ ...job, sketch }),
  }, "room_added", `Added ${name}. Dimensions are not measured yet.`);
}

function acceptLine(job: Job, itemId: string): Job {
  const status = activeEstimate(job)?.status ?? null;
  if (status === "estimator_approved" || status === "customer_authorized") throw new Error("This version is locked. It was not changed.");
  const items = job.scopeItems.map((item) => item.id === itemId && item.proposal === "suggested"
    ? { ...item, proposal: "proposed" as const, scopeClass: "supported" as const, reviewStatus: "accepted" as const }
    : item);
  return reprice({ ...job, scopeItems: items }, activeEstimate(job)?.settings, "Suggested line accepted. The version is still a draft until the estimator approves it.");
}

function requireDraft(job: Job) {
  const current = activeEstimate(job);
  if (!current) throw new Error("No draft estimate.");
  return current;
}

function audit(job: Job, action: string, detail: string): Job {
  return {
    ...job,
    updatedAt: nowIso(),
    audit: [...job.audit, { id: createId("aud"), at: nowIso(), actor: { name: "User", role: "estimator" }, action, detail }],
  };
}

export type { ScopeItem };
