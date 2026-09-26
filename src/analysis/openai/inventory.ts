import { inventoryVisionModel, triageVisionModel, type Env } from "@/analysis/config";
import { noteModelUse, type UsageAttribution } from "@/analysis/usage-log";
import { OBJECT_CATEGORIES, DAMAGE_TYPES, type PreliminaryCondition, type RawDetection } from "@/analysis/objects/detect";
import type { TileRef } from "@/analysis/objects/detect";
import type { ObjectConfirmation } from "@/analysis/objects/escalate";
import { usageFromChat } from "@/analysis/video/cost";
import { openaiVisionConfigured } from "@/analysis/video/vision-provider";
import type { AnalysisStageCost, DamageSeverity, DamageType, ObjectCondition } from "@/domain/types";

export type InventoryPass = "triage" | "inventory";

/**
 * Exhaustive inventory for one frame and its crops.
 * The schema does not set a max item count. Small devices are requested again
 * on each crop so a wide frame cannot hide them.
 */

export function inventorySchema(pass: InventoryPass = "inventory"): Record<string, unknown> {
  return {
    type: "object",
    additionalProperties: false,
    required: ["objects"],
    properties: {
      objects: {
        type: "array",
        items: {
          type: "object",
          additionalProperties: false,
          required: ["category", "label", "material", "box", "confidence", "condition", "damageTypes", "severity", "rationale"],
          properties: {
            category: { type: "string", enum: OBJECT_CATEGORIES },
            label: { type: "string" },
            material: { anyOf: [{ type: "string" }, { type: "null" }] },
            box: {
              type: "object",
              additionalProperties: false,
              required: ["x", "y", "width", "height"],
              properties: { x: { type: "number" }, y: { type: "number" }, width: { type: "number" }, height: { type: "number" } },
            },
            confidence: { type: "number" },
            condition: { type: "string", enum: pass === "triage" ? ["ok", "possibly_damaged", "unclear"] : ["ok", "damaged", "unclear"] },
            damageTypes: { type: "array", items: { type: "string", enum: DAMAGE_TYPES } },
            severity: { anyOf: [{ type: "string", enum: ["none", "minor", "moderate", "severe"] }, { type: "null" }] },
            rationale: { type: "string" },
          },
        },
      },
    },
  };
}

export function confirmSchema(): Record<string, unknown> {
  return {
    type: "object",
    additionalProperties: false,
    required: ["condition", "damageTypes", "severity", "confidence", "rationale", "extentNote"],
    properties: {
      condition: { type: "string", enum: ["ok", "damaged", "unclear"] },
      damageTypes: { type: "array", items: { type: "string", enum: DAMAGE_TYPES } },
      severity: { anyOf: [{ type: "string", enum: ["none", "minor", "moderate", "severe"] }, { type: "null" }] },
      confidence: { type: "number" },
      rationale: { type: "string" },
      extentNote: { anyOf: [{ type: "string" }, { type: "null" }] },
    },
  };
}

export function inventoryPrompt(tileNote: string, pass: InventoryPass = "inventory"): string {
  const condition = pass === "triage"
    ? "condition is a preliminary call: ok, possibly_damaged, or unclear. Use possibly_damaged when something looks wrong. Use unclear when you cannot tell. confidence is 0 to 1."
    : "condition is ok, damaged, or unclear. Use unclear when you cannot tell. rationale is one sentence.";
  return [
    "List every visible building component and content item in this image.",
    "Cover drywall, ceiling, baseboard, trim, casing, doors, windows, flooring, cabinets, countertops, fixtures, outlets, switches, vents, lights, HVAC, plumbing fixtures, appliances, furniture, and contents.",
    "Do not stop at a round number. If it is visible, include it. Do not invent objects, damage, measurements, or prices.",
    "box is normalized 0-1 with origin at the top left of THIS image.",
    condition,
    tileNote,
  ].join(" ");
}

export function confirmPrompt(label: string, category: string, room: string | null): string {
  return [
    `This crop shows one object already found in a walkthrough: ${label} (${category})${room ? ` in the ${room}` : ""}.`,
    "Confirm whether that object is ok, damaged, or unclear.",
    "Set severity and damage types only when it is damaged. Use unclear when you cannot tell.",
    "extentNote is one sentence on how much of this crop looks affected. It is not a tape measurement.",
    "Do not invent measurements, prices, or objects other than this one.",
  ].join(" ");
}

export async function inventoryFrame(input: {
  frameId: string;
  mediaId: string;
  timeMs: number;
  roomHint: string | null;
  full: { bytes: Uint8Array; mimeType: string };
  crops?: { tile: { row: number; col: number; rows: number; cols: number }; bytes: Uint8Array; mimeType: string }[];
  env?: Env;
  fetchImpl?: typeof fetch;
  jobId?: string | null;
  attribution?: UsageAttribution;
  model?: string;
  pass?: InventoryPass;
}): Promise<{ detections: RawDetection[]; stage: AnalysisStageCost; note: string }> {
  const env = input.env ?? process.env;
  const pass = input.pass ?? "inventory";
  const model = input.model ?? (pass === "triage" ? triageVisionModel(env) : inventoryVisionModel(env));
  if (!openaiVisionConfigured(env)) {
    return { detections: [], stage: usageFromChat(null, 0, model, pass === "triage" ? "triage" : "inventory"), note: "OPENAI_API_KEY is not set. Objects were not invented." };
  }
  const images: { bytes: Uint8Array; mimeType: string; tile: TileRef | null; note: string }[] = [
    { bytes: input.full.bytes, mimeType: input.full.mimeType, tile: null, note: "This is the full frame." },
    ...(input.crops ?? []).map((crop) => ({ bytes: crop.bytes, mimeType: crop.mimeType, tile: crop.tile, note: `This crop is row ${crop.tile.row + 1} of ${crop.tile.rows}, column ${crop.tile.col + 1} of ${crop.tile.cols}.` })),
  ];
  const fetchImpl = input.fetchImpl ?? fetch;
  const detections: RawDetection[] = [];
  let inputTokens = 0;
  let outputTokens = 0;
  const started = Date.now();
  for (const image of images) {
    const response = await fetchImpl("https://api.openai.com/v1/chat/completions", {
      method: "POST",
      headers: { Authorization: `Bearer ${env.OPENAI_API_KEY}`, "Content-Type": "application/json" },
      body: JSON.stringify({
        model,
        ...(usesReasoningEffort(model) ? { reasoning_effort: "low" } : {}),
        response_format: { type: "json_schema", json_schema: { name: "frame_inventory", strict: true, schema: inventorySchema(pass) } },
        messages: [{
          role: "user",
          content: [
            { type: "text", text: inventoryPrompt(image.note, pass) },
            { type: "image_url", image_url: { url: `data:${image.mimeType || "image/jpeg"};base64,${Buffer.from(image.bytes).toString("base64")}` } },
          ],
        }],
      }),
    });
    const payload = await response.json().catch(() => null);
    await noteModelUse(payload, model, input.jobId, input.attribution);
    const usage = payload && typeof payload === "object" ? (payload as { usage?: { prompt_tokens?: number; completion_tokens?: number } }).usage : undefined;
    inputTokens += usage?.prompt_tokens ?? 0;
    outputTokens += usage?.completion_tokens ?? 0;
    if (!response.ok) continue;
    const text = payload && typeof payload === "object" ? (payload as { choices?: { message?: { content?: string } }[] }).choices?.[0]?.message?.content : null;
    if (!text) continue;
    try {
      detections.push(...detectionsFromPayload(JSON.parse(text), input, image.tile, { triage: pass === "triage" }));
    } catch {
      // One bad crop does not invent objects for the others.
    }
  }
  const stage = usageFromChat({ usage: { prompt_tokens: inputTokens, completion_tokens: outputTokens } }, Date.now() - started, model, pass === "triage" ? "triage" : "inventory");
  return { detections, stage, note: detections.length ? "Names come from a vision model. They can be wrong, and they are not measurements." : "No object passed validation. Nothing was invented." };
}

export async function confirmObject(input: {
  bytes: Uint8Array;
  mimeType: string;
  label: string;
  category: string;
  roomHint: string | null;
  env?: Env;
  fetchImpl?: typeof fetch;
  jobId?: string | null;
  attribution?: UsageAttribution;
  model?: string;
}): Promise<{ confirmation: ObjectConfirmation | null; stage: AnalysisStageCost }> {
  const env = input.env ?? process.env;
  const model = input.model ?? inventoryVisionModel(env);
  const started = Date.now();
  if (!openaiVisionConfigured(env)) {
    return { confirmation: null, stage: usageFromChat(null, 0, model, "escalation") };
  }
  const fetchImpl = input.fetchImpl ?? fetch;
  const response = await fetchImpl("https://api.openai.com/v1/chat/completions", {
    method: "POST",
    headers: { Authorization: `Bearer ${env.OPENAI_API_KEY}`, "Content-Type": "application/json" },
    body: JSON.stringify({
      model,
      ...(usesReasoningEffort(model) ? { reasoning_effort: "low" } : {}),
      response_format: { type: "json_schema", json_schema: { name: "object_confirmation", strict: true, schema: confirmSchema() } },
      messages: [{
        role: "user",
        content: [
          { type: "text", text: confirmPrompt(input.label, input.category, input.roomHint) },
          { type: "image_url", image_url: { url: `data:${input.mimeType || "image/jpeg"};base64,${Buffer.from(input.bytes).toString("base64")}` } },
        ],
      }],
    }),
  });
  const payload = await response.json().catch(() => null);
  await noteModelUse(payload, model, input.jobId, input.attribution);
  const stage = usageFromChat(payload, Date.now() - started, model, "escalation");
  if (!response.ok) return { confirmation: null, stage };
  const text = payload && typeof payload === "object" ? (payload as { choices?: { message?: { content?: string } }[] }).choices?.[0]?.message?.content : null;
  if (!text) return { confirmation: null, stage };
  try {
    return { confirmation: confirmationFromPayload(JSON.parse(text)), stage };
  } catch {
    return { confirmation: null, stage };
  }
}

function usesReasoningEffort(model: string): boolean {
  return model.startsWith("gpt-5") || model.startsWith("gpt-6");
}

export function confirmationFromPayload(parsed: unknown): ObjectConfirmation | null {
  if (!parsed || typeof parsed !== "object") return null;
  const row = parsed as Record<string, unknown>;
  const condition = row.condition === "ok" || row.condition === "damaged" || row.condition === "unclear" ? row.condition : null;
  if (!condition) return null;
  const severity = row.severity === "none" || row.severity === "minor" || row.severity === "moderate" || row.severity === "severe" ? row.severity : null;
  return {
    condition,
    damageTypes: damageTypesFrom(row.damageTypes),
    severity: condition === "ok" ? "none" : severity,
    confidence: typeof row.confidence === "number" ? row.confidence : 0,
    rationale: typeof row.rationale === "string" ? row.rationale : "",
    extentNote: typeof row.extentNote === "string" ? row.extentNote : null,
  };
}

function conditionReading(value: unknown, triage: boolean): { condition: ObjectCondition; preliminary: PreliminaryCondition | null } {
  if (value === "possibly_damaged") return { condition: "damaged", preliminary: "possibly_damaged" };
  if (value === "ok") return { condition: "ok", preliminary: triage ? "ok" : null };
  if (value === "damaged") return { condition: "damaged", preliminary: triage ? "possibly_damaged" : null };
  return { condition: "unclear", preliminary: triage ? "unclear" : null };
}

function damageTypesFrom(value: unknown): DamageType[] {
  if (!Array.isArray(value)) return [];
  return value.filter((type): type is DamageType => DAMAGE_TYPES.includes(type as DamageType));
}

export function detectionsFromPayload(parsed: unknown, input: { frameId: string; mediaId: string; timeMs: number; roomHint: string | null }, tile: TileRef | null, options?: { triage?: boolean }): RawDetection[] {
  const rows = parsed && typeof parsed === "object" && Array.isArray((parsed as { objects?: unknown }).objects) ? (parsed as { objects: unknown[] }).objects : [];
  const out: RawDetection[] = [];
  for (const item of rows) {
    if (!item || typeof item !== "object") continue;
    const row = item as Record<string, unknown>;
    const label = typeof row.label === "string" ? row.label.trim() : "";
    const category = OBJECT_CATEGORIES.find((entry) => entry === row.category);
    if (!label || !category) continue;
    const boxRaw = row.box && typeof row.box === "object" ? row.box as Record<string, unknown> : {};
    const reading = conditionReading(row.condition, options?.triage === true);
    out.push({
      mediaId: input.mediaId,
      frameId: input.frameId,
      timeMs: input.timeMs,
      roomHint: input.roomHint,
      tile,
      category,
      label,
      material: typeof row.material === "string" ? row.material : null,
      box: { x: Number(boxRaw.x) || 0, y: Number(boxRaw.y) || 0, width: Number(boxRaw.width) || 0, height: Number(boxRaw.height) || 0 },
      confidence: typeof row.confidence === "number" ? row.confidence : 0,
      condition: reading.condition,
      preliminary: reading.preliminary,
      damageTypes: damageTypesFrom(row.damageTypes),
      severity: row.severity === "none" || row.severity === "minor" || row.severity === "moderate" || row.severity === "severe" ? row.severity as DamageSeverity : null,
      rationale: typeof row.rationale === "string" ? row.rationale : null,
    });
  }
  return out;
}
