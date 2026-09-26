import { describe, expect, it } from "vitest";
import { STARTER_CATALOG } from "@/domain/catalog";
import type { TranscriptSegment } from "@/domain/types";
import { analysisMode, auditRate, escalateBelow, triageVisionModel } from "@/analysis/config";
import { confirmationFromPayload, confirmObject, detectionsFromPayload, inventoryFrame, inventorySchema } from "@/analysis/openai/inventory";
import { expectedModeMinuteUsd } from "@/analysis/video/cost";
import { dedupeDetections } from "./dedupe";
import type { RawDetection } from "./detect";
import { tileToFrame } from "./detect";
import { paddedFrameBox } from "./tiles";
import { narrationCues } from "./narration";
import { analyzeObjects } from "./run";
import { applyCheapReading, applyConfirmation, applyTriageUnconfirmed, framesToConfirm, mergeConfirmations, planEscalation } from "./escalate";

function sighting(partial: Partial<RawDetection> & Pick<RawDetection, "category" | "label" | "condition" | "confidence">): RawDetection {
  return {
    mediaId: "m",
    frameId: "frm_1",
    timeMs: 0,
    roomHint: "Kitchen",
    tile: null,
    material: null,
    box: { x: 0.1, y: 0.2, width: 0.3, height: 0.4 },
    damageTypes: [],
    severity: "none",
    rationale: null,
    ...partial,
  };
}

function wetLines(): TranscriptSegment[] {
  return [
    { id: "a", mediaId: "m", startMs: 0, endMs: 3000, text: "This is the kitchen.", speaker: "narrator", injectionFlags: [], source: "sample" },
    { id: "b", mediaId: "m", startMs: 4000, endMs: 8000, text: "This wall is wet to 2 feet along 10 feet.", speaker: "narrator", injectionFlags: [], source: "sample" },
  ];
}

function plan(items: RawDetection[], extra?: { auditRate?: number; random?: () => number; mode?: "cascade" | "strong" | "cheap"; threshold?: number; lines?: TranscriptSegment[] }) {
  const clusters = dedupeDetections(items);
  return {
    clusters,
    ...planEscalation({
      clusters,
      cues: narrationCues(extra?.lines ?? []),
      mode: extra?.mode ?? "cascade",
      threshold: extra?.threshold ?? 0.75,
      auditRate: extra?.auditRate ?? 0,
      random: extra?.random,
    }),
  };
}

describe("cascade escalation", () => {
  it("escalates possibly damaged, unclear, and low-confidence objects", () => {
    const damaged = plan([sighting({ category: "cabinet", label: "Cabinet", condition: "damaged", preliminary: "possibly_damaged", confidence: 0.99 })]);
    expect(damaged.decisions[0]).toMatchObject({ escalate: true, reason: "possibly_damaged" });
    const unclear = plan([sighting({ category: "switch", label: "Switch", condition: "unclear", preliminary: "unclear", confidence: 0.9 })]);
    expect(unclear.decisions[0]).toMatchObject({ escalate: true, reason: "unclear" });
    const low = plan([sighting({ category: "window", label: "Window", condition: "ok", preliminary: "ok", confidence: 0.74 })]);
    expect(low.decisions[0]).toMatchObject({ escalate: true, reason: "low_confidence" });
    expect(low.counts).toMatchObject({ triaged: 1, escalated: 1, keptOk: 0, audit: 0 });
  });

  it("keeps a confident ok object unless narration or the audit draw selects it", () => {
    const kept = plan([sighting({ category: "window", label: "Window", condition: "ok", preliminary: "ok", confidence: 0.91 })]);
    expect(kept.decisions[0]).toMatchObject({ escalate: false, reason: "kept_ok" });
    expect(kept.counts.keptOk).toBe(1);

    const narrated = plan(
      [sighting({ category: "drywall", label: "Drywall", condition: "ok", preliminary: "ok", confidence: 0.93 })],
      { lines: wetLines() },
    );
    expect(narrated.decisions[0]).toMatchObject({ escalate: true, reason: "narration" });
    expect(narrated.counts.narration).toBe(1);
    expect(narrated.counts.audit).toBe(0);

    const said = plan(
      [sighting({ category: "door", label: "Door", condition: "ok", preliminary: "ok", confidence: 0.9 })],
      { lines: [{ id: "c", mediaId: "m", startMs: 0, endMs: 2000, text: "This is the kitchen. The door is damaged.", speaker: "narrator", injectionFlags: [], source: "sample" }] },
    );
    expect(said.decisions[0]?.reason).toBe("narration");

    const draws = [0.05, 0.95];
    let index = 0;
    const audited = plan([
      sighting({ category: "window", label: "Window", condition: "ok", preliminary: "ok", confidence: 0.95 }),
      sighting({ category: "door", label: "Door", condition: "ok", preliminary: "ok", confidence: 0.92, frameId: "frm_2" }),
    ], { auditRate: 0.5, random: () => draws[index++] ?? 1 });
    expect(audited.decisions.map((decision) => decision.reason)).toEqual(["audit", "kept_ok"]);
    expect(audited.counts).toMatchObject({ triaged: 2, escalated: 1, audit: 1, keptOk: 1, narration: 0 });

    const all = plan([
      sighting({ category: "window", label: "Window", condition: "ok", preliminary: "ok", confidence: 0.95 }),
    ], { auditRate: 1, random: () => { throw new Error("rate 1 does not draw"); } });
    expect(all.decisions[0]?.reason).toBe("audit");
  });

  it("counts narration even when the object was already going to the strong model", () => {
    const both = plan(
      [sighting({ category: "drywall", label: "Drywall", condition: "damaged", preliminary: "possibly_damaged", confidence: 0.4, damageTypes: ["wet"] })],
      { lines: wetLines() },
    );
    expect(both.decisions[0]?.reason).toBe("possibly_damaged");
    expect(both.counts.narration).toBe(1);
  });

  it("switches with the analysis mode", () => {
    const items = [
      sighting({ category: "drywall", label: "Drywall", condition: "damaged", preliminary: "possibly_damaged", confidence: 0.8 }),
      sighting({ category: "window", label: "Window", condition: "ok", preliminary: "ok", confidence: 0.9 }),
    ];
    expect(plan(items, { mode: "cheap" }).counts).toMatchObject({ mode: "cheap", triaged: 2, escalated: 0, keptOk: 1 });
    expect(plan(items, { mode: "strong" }).counts).toMatchObject({ mode: "strong", triaged: 0, escalated: 2, keptOk: 0 });
    expect(analysisMode({})).toBe("cascade");
    expect(analysisMode({ ANALYSIS_MODE: "STRONG" })).toBe("strong");
    expect(analysisMode({ ANALYSIS_MODE: "cheap" })).toBe("cheap");
    expect(analysisMode({ ANALYSIS_MODE: "nope" })).toBe("cascade");
    expect(triageVisionModel({})).toBe("gpt-4o-mini");
    expect(triageVisionModel({ OPENAI_TRIAGE_MODEL: "gpt-4.1-mini" })).toBe("gpt-4.1-mini");
    expect(escalateBelow({})).toBe(0.75);
    expect(escalateBelow({ ANALYSIS_ESCALATE_BELOW: "" })).toBe(0.75);
    expect(escalateBelow({ ANALYSIS_ESCALATE_BELOW: "0.5" })).toBe(0.5);
    expect(auditRate({})).toBe(0.1);
    expect(auditRate({ ANALYSIS_AUDIT_RATE: "0" })).toBe(0);
  });

  it("lets a strong confirmation drive the line and drops an unconfirmed triage guess", () => {
    const rooms = [{ id: "room_kitchen", name: "Kitchen" }];
    const guess = dedupeDetections([sighting({
      category: "drywall", label: "Drywall", material: "painted gypsum", condition: "damaged", preliminary: "possibly_damaged", confidence: 0.9, damageTypes: ["wet"], severity: "moderate",
    })]);
    applyTriageUnconfirmed(guess[0]!, "gpt-4o-mini");
    const unconfirmed = analyzeObjects({ detections: guess[0]!.sightings, transcripts: wetLines(), rooms, catalog: STARTER_CATALOG });
    expect(unconfirmed.objects[0]?.condition).toBe("unclear");
    expect(unconfirmed.objects[0]?.assessedBy).toBe("gpt-4o-mini");
    expect(unconfirmed.scopeItems.map((item) => item.code)).not.toContain("MIT-FLOOD-CUT");

    const confirmed = dedupeDetections([sighting({
      category: "drywall", label: "Drywall", material: "painted gypsum", condition: "damaged", preliminary: "possibly_damaged", confidence: 0.4, damageTypes: ["wet"], severity: "minor",
    })]);
    applyConfirmation(confirmed[0]!, {
      condition: "damaged",
      damageTypes: ["wet"],
      severity: "moderate",
      confidence: 0.86,
      rationale: "The lower wall is darkened.",
      extentNote: "About the bottom quarter of the crop looks wet.",
    }, "gpt-6-astra");
    const lines = analyzeObjects({ detections: confirmed[0]!.sightings, transcripts: wetLines(), rooms, catalog: STARTER_CATALOG });
    expect(lines.objects[0]?.condition).toBe("damaged");
    expect(lines.objects[0]?.assessedBy).toBe("gpt-6-astra");
    expect(lines.objects[0]?.assessment.rationale).toContain("bottom quarter");
    expect(lines.scopeItems.map((item) => item.code)).toContain("MIT-FLOOD-CUT");

    const cleared = dedupeDetections([sighting({
      category: "drywall", label: "Drywall", material: "painted gypsum", condition: "damaged", preliminary: "possibly_damaged", confidence: 0.9, damageTypes: ["wet"], severity: "moderate",
    })]);
    applyConfirmation(cleared[0]!, {
      condition: "ok",
      damageTypes: [],
      severity: "none",
      confidence: 0.9,
      rationale: "The wall looks dry in this crop.",
      extentNote: null,
    }, "gpt-6-astra");
    const ok = analyzeObjects({ detections: cleared[0]!.sightings, transcripts: wetLines(), rooms, catalog: STARTER_CATALOG });
    expect(ok.objects[0]?.condition).toBe("ok");
    expect(ok.scopeItems.map((item) => item.code)).not.toContain("MIT-FLOOD-CUT");

    const cheap = dedupeDetections([sighting({
      category: "drywall", label: "Drywall", material: "painted gypsum", condition: "damaged", preliminary: "possibly_damaged", confidence: 0.8, damageTypes: ["wet"], severity: "moderate",
    })]);
    applyCheapReading(cheap[0]!, "gpt-4o-mini");
    const cheapLines = analyzeObjects({ detections: cheap[0]!.sightings, transcripts: wetLines(), rooms, catalog: STARTER_CATALOG });
    expect(cheapLines.objects[0]?.assessedBy).toBe("gpt-4o-mini");
    expect(cheapLines.scopeItems.map((item) => item.code)).toContain("MIT-FLOOD-CUT");
  });

  it("crops the object box on the full frame, once per frame", () => {
    const cluster = dedupeDetections([
      sighting({
        category: "cabinet", label: "Cabinet", condition: "unclear", preliminary: "unclear", confidence: 0.4,
        tile: { row: 1, col: 0, rows: 2, cols: 2 },
        box: { x: 0.5, y: 0.5, width: 0.2, height: 0.2 },
      }),
      sighting({
        category: "cabinet", label: "Cabinet", condition: "unclear", preliminary: "unclear", confidence: 0.8,
        frameId: "frm_1",
        tile: { row: 1, col: 0, rows: 2, cols: 2 },
        box: { x: 0.52, y: 0.5, width: 0.2, height: 0.2 },
      }),
      sighting({
        category: "cabinet", label: "Cabinet", condition: "unclear", preliminary: "unclear", confidence: 0.7,
        frameId: "frm_4", timeMs: 4000,
        box: { x: 0.2, y: 0.2, width: 0.1, height: 0.1 },
      }),
    ]);
    expect(cluster).toHaveLength(1);
    const frames = framesToConfirm(cluster[0]!);
    expect(frames.map((frame) => frame.frameId)).toEqual(["frm_1", "frm_4"]);
    const mapped = tileToFrame({ x: 0.52, y: 0.5, width: 0.2, height: 0.2 }, { row: 1, col: 0, rows: 2, cols: 2 });
    expect(frames[0]?.box).toEqual(paddedFrameBox(mapped));
    expect(frames[0]?.box.x).toBeGreaterThan(0);
    expect(frames[0]?.box.width).toBeLessThan(0.5);
  });

  it("keeps the more severe confirmation when crops disagree", () => {
    const merged = mergeConfirmations([
      { condition: "ok", damageTypes: [], severity: "none", confidence: 0.9, rationale: "Dry.", extentNote: null },
      { condition: "damaged", damageTypes: ["wet"], severity: "moderate", confidence: 0.7, rationale: "Wet along the bottom.", extentNote: "Bottom edge." },
    ]);
    expect(merged?.condition).toBe("damaged");
    expect(merged?.severity).toBe("moderate");
    expect(merged?.extentNote).toContain("Bottom edge");
  });

  it("prices each mode as a planning estimate", () => {
    expect(expectedModeMinuteUsd("cheap").totalUsd).toBeCloseTo(0.02316, 5);
    expect(expectedModeMinuteUsd("cascade").totalUsd).toBeCloseTo(0.27916, 5);
    expect(expectedModeMinuteUsd("strong").totalUsd).toBeCloseTo(1.539, 5);
    expect(expectedModeMinuteUsd("cascade").escalatedCrops).toBe(8);
    expect(expectedModeMinuteUsd("strong").triageModel).toBeNull();
    expect(expectedModeMinuteUsd("cheap").visionModel).toBeNull();
  });
});

describe("cascade model calls", () => {
  it("asks the triage model for a preliminary condition and logs that model", async () => {
    const bodies: { model?: string; response_format?: { json_schema?: { schema?: unknown } } }[] = [];
    const fetchImpl = (async (_url: string, init?: RequestInit) => {
      bodies.push(JSON.parse(String(init?.body)));
      return new Response(JSON.stringify({
        usage: { prompt_tokens: 11, completion_tokens: 4 },
        choices: [{ message: { content: JSON.stringify({ objects: [{ category: "drywall", label: "Drywall", material: null, box: { x: 0.1, y: 0.2, width: 0.3, height: 0.4 }, confidence: 0.42, condition: "possibly_damaged", damageTypes: ["wet"], severity: "minor", rationale: "Lower wall looks dark." }] }) } }],
      }), { status: 200 });
    }) as typeof fetch;
    const result = await inventoryFrame({
      frameId: "frm_1",
      mediaId: "m",
      timeMs: 0,
      roomHint: "Kitchen",
      full: { bytes: new Uint8Array([1, 2, 3]), mimeType: "image/jpeg" },
      env: { OPENAI_API_KEY: "sk-test" },
      fetchImpl,
      pass: "triage",
      attribution: { orgId: null, userEmail: "" },
    });
    expect(bodies[0]?.model).toBe("gpt-4o-mini");
    expect(JSON.stringify(bodies[0]?.response_format?.json_schema?.schema)).toContain("possibly_damaged");
    expect(JSON.stringify(inventorySchema())).not.toContain("possibly_damaged");
    expect(result.detections[0]?.preliminary).toBe("possibly_damaged");
    expect(result.detections[0]?.condition).toBe("damaged");
    expect(result.stage).toMatchObject({ stage: "triage", model: "gpt-4o-mini", inputTokens: 11, outputTokens: 4 });
    const parsed = detectionsFromPayload({ objects: [{ category: "outlet", label: "Outlet", material: null, box: { x: 0, y: 0, width: 0.1, height: 0.1 }, confidence: 0.2, condition: "unclear", damageTypes: [], severity: null, rationale: "Small." }] }, { frameId: "frm_1", mediaId: "m", timeMs: 0, roomHint: null }, null, { triage: true });
    expect(parsed[0]?.preliminary).toBe("unclear");
  });

  it("sends an object crop to the strong model and logs its tokens", async () => {
    const bodies: { model?: string; reasoning_effort?: string }[] = [];
    const fetchImpl = (async (_url: string, init?: RequestInit) => {
      bodies.push(JSON.parse(String(init?.body)));
      return new Response(JSON.stringify({
        usage: { prompt_tokens: 1200, completion_tokens: 400 },
        choices: [{ message: { content: JSON.stringify({ condition: "damaged", damageTypes: ["wet"], severity: "moderate", confidence: 0.81, rationale: "The bottom is darkened.", extentNote: "The lower band of the crop." }) } }],
      }), { status: 200 });
    }) as typeof fetch;
    const result = await confirmObject({
      bytes: new Uint8Array([9]),
      mimeType: "image/jpeg",
      label: "Drywall",
      category: "drywall",
      roomHint: "Kitchen",
      env: { OPENAI_API_KEY: "sk-test" },
      fetchImpl,
      attribution: { orgId: null, userEmail: "" },
    });
    expect(bodies[0]?.model).toBe("gpt-6-astra");
    expect(bodies[0]?.reasoning_effort).toBe("low");
    expect(result.confirmation?.condition).toBe("damaged");
    expect(result.confirmation?.extentNote).toContain("lower band");
    expect(result.stage).toMatchObject({ stage: "escalation", model: "gpt-6-astra", inputTokens: 1200, outputTokens: 400 });
    expect(confirmationFromPayload({ condition: "ok" })?.severity).toBe("none");
    expect(confirmationFromPayload({ nope: true })).toBeNull();
  });
});
