import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { STARTER_CATALOG } from "@/domain/catalog";
import { applyJobAction } from "@/domain/actions";
import { createEmptyJob, runPipeline } from "@/analysis/pipeline";
import { DEFAULT_PRICING_SETTINGS, priceAll } from "@/domain/pricing";
import { DEMO_PRICE_BOOK } from "@/domain/price-book";
import type { TranscriptSegment } from "@/domain/types";
import { evaluateFixture, parseInventoryPayload, scoreRecall } from "@/analysis/video/analyzer";
import { inventorySchema } from "@/analysis/openai/inventory";
import { dedupeDetections } from "./dedupe";
import type { RawDetection } from "./detect";
import { analyzeObjects } from "./run";
import { tileToFrame } from "./detect";
import kitchen from "@/analysis/eval/fixtures/kitchen-objects.json";
import tileRecall from "@/analysis/eval/fixtures/tile-recall.json";
import unclearSwitch from "@/analysis/eval/fixtures/unclear-switch.json";

function segments(lines: { startMs: number; text: string }[], mediaId = "media-kitchen"): TranscriptSegment[] {
  return lines.map((line, index) => ({
    id: `seg_${index}`,
    mediaId,
    startMs: line.startMs,
    endMs: line.startMs + 3000,
    text: line.text,
    speaker: "narrator" as const,
    injectionFlags: [],
    source: "sample" as const,
  }));
}

function withMedia(detections: RawDetection[], mediaId: string): RawDetection[] {
  return detections.map((detection) => ({ ...detection, mediaId }));
}

describe("object inventory", () => {
  it("keeps a crop-only outlet and does not cap a long list", () => {
    const many = Array.from({ length: 30 }, (_, index) => ({
      mediaId: "m",
      frameId: "same",
      timeMs: 0,
      roomHint: "Kitchen",
      tile: null,
      category: "outlet" as const,
      label: "Duplex outlet",
      material: null,
      box: { x: index / 30, y: 0.4, width: 0.02, height: 0.04 },
      confidence: 0.5,
      condition: "ok" as const,
      damageTypes: [],
      severity: "none" as const,
      rationale: null,
    }));
    expect(dedupeDetections(many)).toHaveLength(30);
    const analysis = analyzeObjects({
      detections: withMedia(kitchen.detections as unknown as RawDetection[], "media-kitchen"),
      transcripts: segments(kitchen.transcript),
      rooms: [{ id: "room_kitchen", name: "Kitchen" }],
      measures: [kitchen.measures],
      catalog: STARTER_CATALOG,
    });
    for (const label of kitchen.expect.labels) expect(analysis.objects.map((object) => object.label)).toContain(label);
    expect(analysis.objects.filter((object) => object.label === "Upper Cabinet")).toHaveLength(1);
    const outlet = analysis.objects.find((object) => object.label === "Duplex Outlet");
    expect(outlet?.sightings[0]?.tile).toBe("r1c0");
    expect(outlet?.sightings[0]?.box.x).toBeLessThan(0.5);
  });

  it("maps narrated wet extent to catalog lines and leaves unclear objects as questions", () => {
    const analysis = analyzeObjects({
      detections: withMedia(kitchen.detections as unknown as RawDetection[], "media-kitchen"),
      transcripts: segments(kitchen.transcript),
      rooms: [{ id: "room_kitchen", name: "Kitchen" }],
      measures: [kitchen.measures],
      catalog: STARTER_CATALOG,
    });
    const codes = analysis.scopeItems.map((item) => item.code);
    for (const code of kitchen.expect.lineCodes) expect(codes).toContain(code);
    const flood = analysis.scopeItems.find((item) => item.code === "MIT-FLOOD-CUT");
    const drywall = analysis.scopeItems.find((item) => item.code === "REB-DRYWALL");
    expect(flood?.quantity.value).toBe(kitchen.expect.floodCutLf);
    expect(flood?.proposal).toBe("proposed");
    expect(drywall?.quantity.value).toBe(kitchen.expect.drywallSf);
    expect(drywall?.objectId).toBeTruthy();
    expect(analysis.scopeItems.filter((item) => kitchen.expect.noLineLabels.includes(analysis.objects.find((object) => object.id === item.objectId)?.label ?? ""))).toHaveLength(0);
    expect(analysis.questions.some((question) => kitchen.expect.questionMentions.every((word) => question.prompt.toLowerCase().includes(word)))).toBe(true);
    expect(analysis.scopeItems.some((item) => item.objectId === analysis.objects.find((object) => object.label === "Duplex Outlet")?.id)).toBe(false);
    const notes = analysis.scopeItems.map((item) => item.quantity.sourceNote).join(" ");
    expect(notes).not.toMatch(/within ±5%/);
    const priced = priceAll(analysis.scopeItems, DEMO_PRICE_BOOK, DEFAULT_PRICING_SETTINGS);
    const floodPrice = priced.lines.find((line) => analysis.scopeItems.find((item) => item.id === line.scopeItemId)?.code === "MIT-FLOOD-CUT");
    expect(floodPrice?.unpricedReason).toMatch(/No price-book rate/);
    expect(floodPrice?.extendedPrice).toBeNull();
  });

  it("claims ±5% only when the calibration check verified the geometry", () => {
    const verified = analyzeObjects({
      detections: [{
        mediaId: "m", frameId: "f", timeMs: 0, roomHint: "Kitchen", tile: null, category: "flooring", label: "Vinyl flooring", material: "vinyl",
        box: { x: 0, y: 0.8, width: 1, height: 0.2 }, confidence: 0.9, condition: "ok", damageTypes: [], severity: "none", rationale: null,
      }],
      transcripts: [],
      rooms: [{ id: "room_kitchen", name: "Kitchen" }],
      measures: [{ ...kitchen.measures, calibrationMeetsTarget: true }],
      catalog: STARTER_CATALOG,
    });
    expect(verified.objects[0]?.quantity.note).toMatch(/within ±5%/);
    const unverified = analyzeObjects({
      detections: verified.objects.length ? [{
        mediaId: "m", frameId: "f", timeMs: 0, roomHint: "Kitchen", tile: null, category: "flooring", label: "Vinyl flooring", material: "vinyl",
        box: { x: 0, y: 0.8, width: 1, height: 0.2 }, confidence: 0.9, condition: "ok", damageTypes: [], severity: "none", rationale: null,
      }] : [],
      transcripts: [],
      rooms: [{ id: "room_kitchen", name: "Kitchen" }],
      measures: [kitchen.measures],
      catalog: STARTER_CATALOG,
    });
    expect(unverified.objects[0]?.quantity.note).not.toMatch(/within ±5%/);
  });

  it("turns an unclear switch into a question and no line", () => {
    const analysis = analyzeObjects({
      detections: withMedia(unclearSwitch.detections as unknown as RawDetection[], unclearSwitch.mediaId),
      transcripts: segments(unclearSwitch.transcript, unclearSwitch.mediaId),
      rooms: [{ id: "room_hall", name: "Hallway" }],
      catalog: STARTER_CATALOG,
    });
    expect(analysis.scopeItems).toHaveLength(0);
    expect(analysis.questions[0]?.prompt.toLowerCase()).toContain("switch");
  });

  it("maps a tile box back onto the full frame", () => {
    const frame = tileToFrame({ x: 0.5, y: 0.5, width: 0.2, height: 0.2 }, { row: 1, col: 0, rows: 2, cols: 2 });
    expect(frame.x).toBeCloseTo(0.25);
    expect(frame.y).toBeCloseTo(0.75);
  });

  it("scores the recall fixture and refuses a capped inventory schema", () => {
    const observations = parseInventoryPayload({ objects: tileRecall.observations });
    const result = evaluateFixture({ slug: tileRecall.slug, expectedLabels: tileRecall.expectedLabels }, observations);
    expect(result.missed).toEqual([]);
    expect(scoreRecall(["Drywall"], tileRecall.expectedLabels).missed).toContain("Duplex outlet");
    expect(JSON.stringify(inventorySchema())).not.toContain("maxItems");
    expect(JSON.stringify(inventorySchema())).not.toContain("possibly_damaged");
    expect(JSON.stringify(inventorySchema("triage"))).toContain("possibly_damaged");
    const raw = readFileSync(path.join(process.cwd(), "src/analysis/eval/fixtures/tile-recall.json"), "utf8");
    expect(raw).toContain("tile-recall");
  });
});

describe("pipeline object lines", () => {
  it("prices known codes, leaves missing codes unpriced, and accepts a suggested line without approving the version", () => {
    const job = runPipeline(createEmptyJob({
      address: "14 Cedar Avenue", city: "Madison", region: "WI", postalCode: "53703", customerName: "M. Alvarez", phone: "", email: "", concern: "Wet wall",
    }), {
      media: [],
      transcripts: segments(kitchen.transcript),
      frames: [],
      usePriceBook: true,
      detections: withMedia(kitchen.detections as unknown as RawDetection[], "media-kitchen"),
      measures: [kitchen.measures],
    });
    expect(job.objects.length).toBeGreaterThan(5);
    const flood = job.scopeItems.find((item) => item.code === "MIT-FLOOD-CUT");
    const priced = job.estimates.at(-1)?.pricedLines.find((line) => line.scopeItemId === flood?.id);
    expect(priced?.unpricedReason).toMatch(/unpriced|No price-book/i);
    const suggested = job.scopeItems.find((item) => item.proposal === "suggested");
    expect(suggested).toBeTruthy();
    const accepted = applyJobAction(job, { type: "accept_line", itemId: suggested!.id });
    expect(accepted.scopeItems.find((item) => item.id === suggested!.id)?.reviewStatus).toBe("accepted");
    expect(accepted.estimates.at(-1)?.status).toBe("ai_draft");
  });
});
