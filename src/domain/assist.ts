import type { IdentifiedObject } from "@/analysis/frames";
import { inventoryFromWalkthrough } from "@/analysis/inventory";
import type { WalkthroughSnapshot } from "@/capture/snapshot";
import type { FloorPlan } from "@/domain/plan-from-measurement";
import { buildResultLines, type ResultLine, type ResultOffer } from "@/domain/results";
import type { EstimateStatus } from "@/domain/types";

export type ConfidenceChip = "High" | "Check" | "Low";

export type AssistOp = "add_item" | "set_quantity" | "set_note" | "set_condition" | "rename_item" | "explain";

export type ProposedChange = {
  op: AssistOp;
  target: string;
  value: string | number | null;
  reason: string;
};

export type AssistProposal = {
  intent: "edit" | "question";
  answer: string | null;
  unknown: string | null;
  changes: ProposedChange[];
};

export type AssistDiff = {
  summary: string;
  before: string;
  after: string;
  blocked: boolean;
};

export type ChangeLogEntry = {
  at: string;
  by: string;
  prompt: string;
  summary: string;
  before: string;
  after: string;
};

export type AssistState = {
  acceptedIds: string[];
  skippedIds: string[];
  conditions: { target: string; value: string }[];
  renames: { from: string; to: string }[];
  notes: { target: string; value: string }[];
  added: { name: string; room: string; quantity: number | null }[];
  log: ChangeLogEntry[];
};

export type ReviewItem = {
  id: string;
  room: string;
  name: string;
  quantity: number | null;
  unit: string;
  confidence: ConfidenceChip;
  priceStatus: "verified" | "unverified" | "unpriced";
  price: number | null;
  needsYou: boolean;
  note: string;
};

export type FollowUp = {
  id: string;
  text: string;
  action: "rerecord" | "answer" | "skip";
};

export const ASSIST_TOOL_NAME = "propose_job_edit";

export const ASSIST_PARAMETERS = {
  type: "object",
  additionalProperties: false,
  required: ["intent", "answer", "unknown", "changes"],
  properties: {
    intent: { type: "string", enum: ["edit", "question"] },
    answer: { type: ["string", "null"] },
    unknown: { type: ["string", "null"] },
    changes: {
      type: "array",
      items: {
        type: "object",
        additionalProperties: false,
        required: ["op", "target", "value", "reason"],
        properties: {
          op: { type: "string", enum: ["add_item", "set_quantity", "set_note", "set_condition", "rename_item", "explain"] },
          target: { type: "string" },
          value: { type: ["string", "number", "null"] },
          reason: { type: "string" },
        },
      },
    },
  },
} as const;

const OPS = new Set<AssistOp>(["add_item", "set_quantity", "set_note", "set_condition", "rename_item", "explain"]);
const NUMBER_WORDS: Record<string, number> = { a: 1, an: 1, one: 1, two: 2, three: 3, four: 4, five: 5, six: 6 };

export function emptyAssist(): AssistState {
  return { acceptedIds: [], skippedIds: [], conditions: [], renames: [], notes: [], added: [], log: [] };
}

export function confidenceFromModel(level: "high" | "medium" | "low" | null | undefined): ConfidenceChip {
  if (level === "high") return "High";
  if (level === "medium") return "Check";
  return "Low";
}

export function confidenceFromDimension(status: string, value: number | null): ConfidenceChip {
  if (value == null || status === "unmeasured" || status === "unresolved") return "Low";
  if (status === "confirmed") return "High";
  return "Check";
}

export function parseProposal(raw: unknown): AssistProposal | null {
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) return null;
  const record = raw as Record<string, unknown>;
  if (Object.keys(record).some((key) => !["intent", "answer", "unknown", "changes"].includes(key))) return null;
  if (record.intent !== "edit" && record.intent !== "question") return null;
  if (!(record.answer === null || typeof record.answer === "string")) return null;
  if (!(record.unknown === null || typeof record.unknown === "string")) return null;
  if (!Array.isArray(record.changes)) return null;
  const changes: ProposedChange[] = [];
  for (const change of record.changes) {
    const parsed = parseChange(change);
    if (!parsed) return null;
    changes.push(parsed);
  }
  return { intent: record.intent, answer: record.answer, unknown: record.unknown, changes };
}

export function jobContext(snapshot: WalkthroughSnapshot): string {
  const review = buildReview(snapshot);
  const lines = review.items.map((item) => `${item.room} ${item.name}: ${item.quantity ?? "no quantity"} ${item.unit}, ${item.confidence}, ${item.priceStatus}`);
  const sizes = review.dimensions.map((item) => `${item.label}: ${item.value} (${item.confidence})`);
  return [`Transcript: ${snapshot.transcript ?? "none"}`, ...sizes, ...lines].join("\n");
}

export function buildReview(snapshot: WalkthroughSnapshot): {
  summary: string;
  items: ReviewItem[];
  dimensions: { label: string; value: string; confidence: ConfidenceChip }[];
  followUps: FollowUp[];
  needsYou: ReviewItem[];
  looksGood: ReviewItem[];
} {
  const assist = snapshot.assist ?? emptyAssist();
  const objects = objectsWithAssist(snapshot);
  const offers = offersWithAssist(snapshot);
  const lines = buildResultLines(inventoryFromWalkthrough(objects, snapshot.plan), offers).map((line) => applyRename(line, assist));
  const items = lines.map((line) => toReviewItem(line, snapshot, assist)).sort(byConfidence);
  const accepted = new Set(assist.acceptedIds);
  const needsYou = items.filter((item) => !accepted.has(item.id) && item.needsYou);
  const looksGood = items.filter((item) => accepted.has(item.id) || !item.needsYou);
  const dimensions = dimensionRows(snapshot.plan);
  const followUps = followUpsFor(snapshot, items).filter((item) => !assist.skippedIds.includes(item.id));
  const room = roomName(snapshot);
  const size = sizePhrase(snapshot.plan);
  const priced = items.filter((item) => item.price != null).length;
  const attention = needsYou.length;
  const summary = [room, size, `${items.length} items`, `${priced} priced`, `${attention} need attention`].filter(Boolean).join(", ");
  return { summary, items, dimensions, followUps, needsYou, looksGood };
}

export function acceptItems(snapshot: WalkthroughSnapshot, ids: string[], by: string, now: string): WalkthroughSnapshot {
  const assist = snapshot.assist ?? emptyAssist();
  const review = buildReview(snapshot);
  const known = new Set(review.items.map((item) => item.id));
  const nextIds = [...new Set([...assist.acceptedIds, ...ids.filter((id) => known.has(id))])];
  return {
    ...snapshot,
    assist: {
      ...assist,
      acceptedIds: nextIds,
      log: [
        ...assist.log,
        { at: now, by, prompt: "Accept", summary: `Accepted ${ids.length} item${ids.length === 1 ? "" : "s"}`, before: "Draft", after: "Accepted" },
      ],
    },
  };
}

export function confidentIds(snapshot: WalkthroughSnapshot): string[] {
  return buildReview(snapshot).needsYou.filter((item) => item.confidence === "High").map((item) => item.id);
}

export function skipFollowUp(snapshot: WalkthroughSnapshot, id: string): WalkthroughSnapshot {
  const assist = snapshot.assist ?? emptyAssist();
  return { ...snapshot, assist: { ...assist, skippedIds: [...new Set([...assist.skippedIds, id])] } };
}

export function interpretUtterance(prompt: string, snapshot: WalkthroughSnapshot): { matched: boolean; proposal: AssistProposal } {
  const text = prompt.trim();
  const empty: AssistProposal = { intent: "question", answer: null, unknown: "I don't know that from this job.", changes: [] };
  const add = text.match(/^(?:please\s+)?add\s+(\d+|a|an|one|two|three|four|five|six)\s+(.+)$/i);
  if (add) {
    const quantity = NUMBER_WORDS[add[1].toLowerCase()] ?? Number(add[1]);
    return { matched: true, proposal: { intent: "edit", answer: null, unknown: null, changes: [{ op: "add_item", target: cleanName(add[2]), value: quantity, reason: "You asked to add it." }] } };
  }
  const flooring = text.match(/^(?:please\s+)?change the flooring to\s+(.+)$/i);
  if (flooring) {
    const target = displayedName(snapshot.assist ?? emptyAssist(), "Flooring");
    return { matched: true, proposal: { intent: "edit", answer: null, unknown: null, changes: [{ op: "rename_item", target, value: cleanName(flooring[1]), reason: "You asked to change the flooring." }] } };
  }
  const mark = text.match(/^(?:please\s+)?mark the\s+(.+?)\s+as\s+(.+)$/i);
  if (mark) {
    return { matched: true, proposal: { intent: "edit", answer: null, unknown: null, changes: [{ op: "set_condition", target: cleanName(mark[1]), value: cleanName(mark[2]), reason: "You asked to mark it." }] } };
  }
  if (/what(?:'s| is) missing/i.test(text)) {
    const gaps = buildReview(snapshot).followUps.map((item) => item.text);
    return { matched: true, proposal: { intent: "question", answer: gaps.length ? gaps.join(" ") : null, unknown: gaps.length ? null : "Nothing else is open on this job.", changes: [] } };
  }
  const why = text.match(/why is the\s+(.+?)\s+unpriced\??$/i);
  if (why) {
    const item = buildReview(snapshot).items.find((line) => line.name.toLowerCase() === cleanName(why[1]).toLowerCase());
    if (!item) return { matched: true, proposal: { ...empty, unknown: "I don't see that item." } };
    if (item.quantity == null) return { matched: true, proposal: { intent: "question", answer: `${item.name} has no measured quantity, so the price stays blank.`, unknown: null, changes: [] } };
    if (item.priceStatus === "unpriced") return { matched: true, proposal: { intent: "question", answer: `${item.name} has no source price, so it stays blank.`, unknown: null, changes: [] } };
    if (item.priceStatus === "unverified") return { matched: true, proposal: { intent: "question", answer: `${item.name} has a price with no source, so it is not verified.`, unknown: null, changes: [] } };
    return { matched: true, proposal: { intent: "question", answer: `${item.name} has a verified price.`, unknown: null, changes: [] } };
  }
  if (/\b(?:width|length|span|height|dimension)\b/i.test(text) && /\b(?:change|set|make)\b/i.test(text)) {
    return { matched: true, proposal: { intent: "edit", answer: null, unknown: null, changes: [{ op: "explain", target: "measurement", value: "locked", reason: "A measurement is not changed from a sentence." }] } };
  }
  return { matched: false, proposal: empty };
}

export function diffProposal(snapshot: WalkthroughSnapshot, proposal: AssistProposal): AssistDiff[] {
  const review = buildReview(snapshot);
  const assist = snapshot.assist ?? emptyAssist();
  return proposal.changes.map((change) => diffChange(review, assist, change, proposal));
}

export function confirmProposal(snapshot: WalkthroughSnapshot, proposal: AssistProposal, actor: { by: string; prompt: string; now: string }): { snapshot: WalkthroughSnapshot; diffs: AssistDiff[] } {
  const diffs = diffProposal(snapshot, proposal);
  const assist = snapshot.assist ?? emptyAssist();
  let objects = snapshot.objects;
  let added = assist.added.map((item) => ({ ...item }));
  const renames = [...assist.renames];
  let conditions = [...assist.conditions];
  let notes = [...assist.notes];
  const log = [...assist.log];
  proposal.changes.forEach((change, index) => {
    const diff = diffs[index];
    if (!diff || diff.blocked) {
      if (diff?.blocked) log.push({ at: actor.now, by: actor.by, prompt: actor.prompt, summary: diff.summary, before: diff.before, after: "Not changed" });
      return;
    }
    if (change.op === "add_item") {
      const quantity = typeof change.value === "number" ? change.value : null;
      added.push({ name: change.target, room: roomName(snapshot), quantity });
    } else if (change.op === "set_quantity" && typeof change.value === "number") {
      const quantity = change.value;
      const target = change.target.toLowerCase();
      objects = objects.map((object) => object.name.toLowerCase() === target ? { ...object, quantity } : object);
      added = added.map((item) => item.name.toLowerCase() === target ? { ...item, quantity } : item);
    } else if (change.op === "rename_item" && typeof change.value === "string") {
      renames.push({ from: change.target, to: change.value });
    } else if (change.op === "set_condition" && typeof change.value === "string") {
      const target = change.target.toLowerCase();
      notes = notes.filter((item) => item.target.toLowerCase() !== target);
      conditions = conditions.filter((item) => item.target.toLowerCase() !== target);
      conditions.push({ target: change.target, value: change.value });
    } else if (change.op === "set_note" && typeof change.value === "string") {
      const target = change.target.toLowerCase();
      conditions = conditions.filter((item) => item.target.toLowerCase() !== target);
      notes = notes.filter((item) => item.target.toLowerCase() !== target);
      notes.push({ target: change.target, value: change.value });
    }
    log.push({ at: actor.now, by: actor.by, prompt: actor.prompt, summary: diff.summary, before: diff.before, after: diff.after });
  });
  if (proposal.intent === "question" && (proposal.answer || proposal.unknown)) {
    log.push({ at: actor.now, by: actor.by, prompt: actor.prompt, summary: "Question", before: actor.prompt, after: proposal.answer ?? proposal.unknown ?? "" });
  }
  return {
    diffs,
    snapshot: {
      ...snapshot,
      objects,
      assist: { ...assist, added, renames, conditions, notes, log },
    },
  };
}

export function notesFromNarration(transcript: string | null, names: string[]): { target: string; note: string }[] {
  if (!transcript?.trim()) return [];
  const notes: { target: string; note: string }[] = [];
  for (const sentence of transcript.split(/[.!?]/)) {
    const lower = sentence.toLowerCase();
    const named = names.find((name) => lower.includes(name.toLowerCase()));
    if (named && /salvage/.test(lower)) notes.push({ target: named, note: "salvageable" });
    if (/floor|flooring/.test(lower) && /\blvp\b|vinyl|hardwood|carpet/.test(lower)) {
      const material = lower.match(/\b(lvp|vinyl|hardwood|carpet)\b/i)?.[1] ?? "";
      if (material) notes.push({ target: "Flooring", note: material.toUpperCase() === "LVP" ? "LVP" : material });
    }
  }
  return notes;
}

export function jobCardSentence(input: { customer: string; concern: string; status: EstimateStatus | null; unpriced: number; viewerIsCustomer?: boolean }): { needsAttention: boolean; sentence: string } {
  if (input.viewerIsCustomer) {
    if (input.status === "estimator_approved") return { needsAttention: true, sentence: "Waiting for a signature." };
    return { needsAttention: false, sentence: input.concern.trim() || input.customer };
  }
  if (input.unpriced > 0) {
    return { needsAttention: true, sentence: input.unpriced === 1 ? "1 line needs a price." : `${input.unpriced} lines need a price.` };
  }
  if (input.status === "estimator_approved") return { needsAttention: true, sentence: "Waiting for a signature." };
  if (!input.status || input.status === "ai_draft" || input.status === "estimator_reviewed") return { needsAttention: true, sentence: "Waiting for approval." };
  return { needsAttention: false, sentence: input.concern.trim() || input.customer };
}

export function sourcesWithAssist(snapshot: WalkthroughSnapshot): { objects: IdentifiedObject[]; offers: ResultOffer[] } {
  return { objects: objectsWithAssist(snapshot), offers: offersWithAssist(snapshot) };
}

export function draftLinesWithAssist<T extends { description: string; materialQuery: string | null }>(snapshot: WalkthroughSnapshot, lines: T[]): T[] {
  const assist = snapshot.assist ?? emptyAssist();
  if (assist.renames.length === 0) return lines;
  return lines.map((line) => {
    if (!line.materialQuery) return line;
    const next = displayedName(assist, line.materialQuery);
    if (next.toLowerCase() === line.materialQuery.toLowerCase()) return line;
    const pattern = new RegExp(line.materialQuery.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"), "ig");
    return { ...line, materialQuery: next, description: line.description.replace(pattern, next) };
  });
}

function parseChange(raw: unknown): ProposedChange | null {
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) return null;
  const record = raw as Record<string, unknown>;
  if (Object.keys(record).some((key) => !["op", "target", "value", "reason"].includes(key))) return null;
  if (typeof record.op !== "string" || !OPS.has(record.op as AssistOp)) return null;
  if (typeof record.target !== "string" || !record.target.trim()) return null;
  if (!(record.value === null || typeof record.value === "string" || typeof record.value === "number")) return null;
  if (typeof record.reason !== "string") return null;
  if (record.op === "set_quantity" && typeof record.value !== "number") return null;
  if ((record.op === "rename_item" || record.op === "set_condition" || record.op === "set_note" || record.op === "add_item") && record.value == null) return null;
  return { op: record.op as AssistOp, target: record.target.trim(), value: typeof record.value === "string" ? record.value.trim() : record.value, reason: record.reason.trim() };
}

function diffChange(review: ReturnType<typeof buildReview>, assist: AssistState, change: ProposedChange, proposal: AssistProposal): AssistDiff {
  if (change.op === "explain") {
    return { summary: "Measurement stays as solved", before: "Locked", after: "Not changed", blocked: true };
  }
  const item = itemForChange(review, assist, change.target);
  if (change.op === "add_item") {
    const quantity = typeof change.value === "number" ? change.value : null;
    return { summary: `Add ${change.target}`, before: "Not on the list", after: quantity == null ? `${change.target}, needs price` : `${quantity} ${change.target}, needs price`, blocked: false };
  }
  if (!item && change.op !== "rename_item") {
    return { summary: `${change.target} is not on this job`, before: "Missing", after: "Not changed", blocked: true };
  }
  if (change.op === "set_quantity") {
    if (!item || item.unit !== "each") return { summary: `${change.target} comes from the sketch`, before: item ? `${item.quantity ?? "—"} ${item.unit}` : "Sketch", after: "Not changed", blocked: true };
    return { summary: `Quantity for ${item.name}`, before: String(item.quantity ?? "—"), after: String(change.value), blocked: false };
  }
  if (change.op === "rename_item") {
    const next = typeof change.value === "string" ? change.value : change.target;
    return { summary: `Change ${change.target}`, before: item ? `${item.name}, ${item.priceStatus}` : "Not on the list", after: `${next}, needs price`, blocked: !item };
  }
  if (change.op === "set_condition" || change.op === "set_note") {
    return { summary: `${item?.name ?? change.target}: ${change.value}`, before: item?.note || "No note", after: String(change.value), blocked: !item };
  }
  return { summary: proposal.answer ?? "No change", before: "", after: proposal.answer ?? "", blocked: true };
}

function toReviewItem(line: ResultLine, snapshot: WalkthroughSnapshot, assist: AssistState): ReviewItem {
  const choice = line.replacements[line.selected] ?? line.replacements[0];
  const priceStatus = choice?.status === "verified" ? "verified" : choice?.unitPrice == null ? "unpriced" : "unverified";
  const object = snapshot.objects.find((item) => item.name.toLowerCase() === line.item.toLowerCase());
  const quantityStatus = snapshot.plan.quantities.find((item) => item.roomName === line.room && surfaceName(item.kind) === line.item)?.status;
  const confidence = object ? confidenceFromModel(object.confidence) : confidenceFromDimension(quantityStatus ?? "estimated", line.quantity);
  const condition = latestValue(assist.conditions, line.item);
  const noted = latestValue(assist.notes, line.item);
  const note = condition ?? noted ?? line.note;
  const needsYou = confidence !== "High" || priceStatus !== "verified" || line.quantity == null;
  return { id: line.id, room: line.room, name: line.item, quantity: line.quantity, unit: line.unit, confidence, priceStatus, price: choice?.unitPrice ?? null, needsYou, note };
}

function objectsWithAssist(snapshot: WalkthroughSnapshot): IdentifiedObject[] {
  const assist = snapshot.assist ?? emptyAssist();
  const added: IdentifiedObject[] = assist.added.map((item) => ({
    name: item.name,
    room: item.room,
    evidence: "You asked to add this.",
    confidence: "medium",
    frames: [],
    quantity: item.quantity,
  }));
  return [...snapshot.objects, ...added];
}

function offersWithAssist(snapshot: WalkthroughSnapshot): ResultOffer[] {
  const renamed = new Set((snapshot.assist?.renames ?? []).map((item) => item.from.toLowerCase()));
  return snapshot.offers.filter((offer) => !renamed.has(offer.query.toLowerCase()));
}

function applyRename(line: ResultLine, assist: AssistState): ResultLine {
  const next = displayedName(assist, line.item);
  if (next.toLowerCase() === line.item.toLowerCase()) return line;
  return {
    ...line,
    item: next,
    replacements: [{ title: null, retailer: null, unitPrice: null, currency: null, url: null, status: "unpriced", note: "No source price for this material." }],
    selected: 0,
    lineTotal: null,
  };
}

function displayedName(assist: AssistState, name: string): string {
  let current = name;
  const used = new Set<number>();
  for (let guard = 0; guard <= assist.renames.length; guard += 1) {
    let found = -1;
    for (let index = assist.renames.length - 1; index >= 0; index -= 1) {
      if (used.has(index)) continue;
      if (assist.renames[index].from.toLowerCase() === current.toLowerCase()) {
        found = index;
        break;
      }
    }
    if (found < 0) return current;
    used.add(found);
    current = assist.renames[found].to;
  }
  return current;
}

function itemForChange(review: ReturnType<typeof buildReview>, assist: AssistState, target: string): ReviewItem | undefined {
  const named = review.items.find((line) => line.name.toLowerCase() === target.toLowerCase());
  if (named) return named;
  const current = displayedName(assist, target);
  if (current.toLowerCase() === target.toLowerCase()) return undefined;
  return review.items.find((line) => line.name.toLowerCase() === current.toLowerCase());
}

function latestValue(entries: { target: string; value: string }[], name: string): string | null {
  for (let index = entries.length - 1; index >= 0; index -= 1) {
    if (entries[index].target.toLowerCase() === name.toLowerCase()) return entries[index].value;
  }
  return null;
}

function dimensionRows(plan: FloorPlan): { label: string; value: string; confidence: ConfidenceChip }[] {
  const rows = plan.edges.map((edge) => ({
    label: edge.label === "span_a" || edge.label === "width" ? "Width" : edge.label === "span_b" || edge.label === "depth" ? "Depth" : "Wall",
    value: edge.valueFt == null ? "—" : `${trim(edge.valueFt)} ft`,
    confidence: confidenceFromDimension(edge.status, edge.valueFt),
  }));
  for (const [roomId, height] of Object.entries(plan.ceilingHeights ?? {})) {
    rows.push({ label: `${plan.names[roomId] ?? "Room"} height`, value: height.valueFt == null ? "—" : `${trim(height.valueFt)} ft`, confidence: confidenceFromDimension(height.status, height.valueFt) });
  }
  return rows;
}

function followUpsFor(snapshot: WalkthroughSnapshot, items: ReviewItem[]): FollowUp[] {
  const followUps: FollowUp[] = [];
  for (const [roomId, height] of Object.entries(snapshot.plan.ceilingHeights ?? {})) {
    if (height.valueFt == null || height.status === "unresolved") {
      followUps.push({ id: `ceiling-${roomId}`, text: "The ceiling wasn't visible. Record 10 more seconds.", action: "rerecord" });
    }
  }
  if (snapshot.plan.edges.some((edge) => edge.valueFt != null) && snapshot.plan.edges.every((edge) => edge.status !== "confirmed")) {
    followUps.push({ id: "sheet", text: "The calibration sheet did not lock a measurement.", action: "rerecord" });
  }
  const vanity = items.find((item) => /vanity/i.test(item.name));
  if (vanity && !/original|replaced/i.test(vanity.note)) followUps.push({ id: `ask-${vanity.id}`, text: "Is the vanity original or replaced?", action: "answer" });
  const drywall = items.find((item) => item.name === "Drywall" && (item.quantity == null || item.priceStatus === "unpriced"));
  if (drywall) followUps.push({ id: "drywall", text: "Drywall has no measured price. It stays blank.", action: "skip" });
  return followUps.slice(0, 4);
}

function sizePhrase(plan: FloorPlan): string | null {
  const width = plan.edges.find((edge) => edge.label === "span_a" || edge.label === "width");
  const depth = plan.edges.find((edge) => edge.label === "span_b" || edge.label === "depth");
  if (width?.valueFt == null || depth?.valueFt == null) return null;
  return `${trim(width.valueFt)} x ${trim(depth.valueFt)} ft`;
}

function surfaceName(kind: string): string {
  if (kind === "floor_area") return "Flooring";
  if (kind === "baseboard") return "Baseboard";
  if (kind === "wall_area") return "Drywall";
  return kind;
}

function byConfidence(a: ReviewItem, b: ReviewItem): number {
  const rank = { Low: 0, Check: 1, High: 2 };
  return rank[a.confidence] - rank[b.confidence];
}

function roomName(snapshot: WalkthroughSnapshot): string {
  const roomId = snapshot.plan.rooms[0]?.id ?? snapshot.plan.rooms[0]?.roomId ?? "";
  return snapshot.plan.names[roomId] ?? Object.values(snapshot.plan.names)[0] ?? "Room";
}

function cleanName(value: string): string {
  return value.replace(/[.?!]+$/g, "").replace(/^(a|an|the)\s+/i, "").trim();
}

function trim(value: number): string {
  return String(Math.round(value * 10) / 10).replace(/\.0$/, "");
}
