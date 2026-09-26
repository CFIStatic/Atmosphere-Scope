import { visionModel, type Env } from "@/analysis/config";
import { OBJECT_CATEGORIES, DAMAGE_TYPES, type RawDetection } from "@/analysis/objects/detect";
import type { TileRef } from "@/analysis/objects/detect";
import { usageFromChat } from "@/analysis/video/cost";
import { openaiVisionConfigured } from "@/analysis/video/vision-provider";
import type { AnalysisStageCost } from "@/domain/types";

/**
 * Exhaustive inventory for one frame and its crops.
 * The schema does not set a max item count. Small devices are requested again
 * on each crop so a wide frame cannot hide them.
 */

export function inventorySchema(): Record<string, unknown> {
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
            condition: { type: "string", enum: ["ok", "damaged", "unclear"] },
            damageTypes: { type: "array", items: { type: "string", enum: DAMAGE_TYPES } },
            severity: { anyOf: [{ type: "string", enum: ["none", "minor", "moderate", "severe"] }, { type: "null" }] },
            rationale: { type: "string" },
          },
        },
      },
    },
  };
}

export function inventoryPrompt(tileNote: string): string {
  return [
    "List every visible building component and content item in this image.",
    "Cover drywall, ceiling, baseboard, trim, casing, doors, windows, flooring, cabinets, countertops, fixtures, outlets, switches, vents, lights, HVAC, plumbing fixtures, appliances, furniture, and contents.",
    "Do not stop at a round number. If it is visible, include it. Do not invent objects, damage, measurements, or prices.",
    "box is normalized 0-1 with origin at the top left of THIS image.",
    "condition is ok, damaged, or unclear. Use unclear when you cannot tell. rationale is one sentence.",
    tileNote,
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
}): Promise<{ detections: RawDetection[]; stage: AnalysisStageCost; note: string }> {
  const env = input.env ?? process.env;
  const model = visionModel(env);
  if (!openaiVisionConfigured(env)) {
    return { detections: [], stage: usageFromChat(null, 0, model, "inventory"), note: "OPENAI_API_KEY is not set. Objects were not invented." };
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
        response_format: { type: "json_schema", json_schema: { name: "frame_inventory", strict: true, schema: inventorySchema() } },
        messages: [{
          role: "user",
          content: [
            { type: "text", text: inventoryPrompt(image.note) },
            { type: "image_url", image_url: { url: `data:${image.mimeType || "image/jpeg"};base64,${Buffer.from(image.bytes).toString("base64")}` } },
          ],
        }],
      }),
    });
    const payload = await response.json().catch(() => null);
    const usage = payload && typeof payload === "object" ? (payload as { usage?: { prompt_tokens?: number; completion_tokens?: number } }).usage : undefined;
    inputTokens += usage?.prompt_tokens ?? 0;
    outputTokens += usage?.completion_tokens ?? 0;
    if (!response.ok) continue;
    const text = payload && typeof payload === "object" ? (payload as { choices?: { message?: { content?: string } }[] }).choices?.[0]?.message?.content : null;
    if (!text) continue;
    try {
      detections.push(...detectionsFromPayload(JSON.parse(text), input, image.tile));
    } catch {
      // One bad crop does not invent objects for the others.
    }
  }
  const stage = usageFromChat({ usage: { prompt_tokens: inputTokens, completion_tokens: outputTokens } }, Date.now() - started, model, "inventory");
  return { detections, stage, note: detections.length ? "Names come from a vision model. They can be wrong, and they are not measurements." : "No object passed validation. Nothing was invented." };
}

export function detectionsFromPayload(parsed: unknown, input: { frameId: string; mediaId: string; timeMs: number; roomHint: string | null }, tile: TileRef | null): RawDetection[] {
  const rows = parsed && typeof parsed === "object" && Array.isArray((parsed as { objects?: unknown }).objects) ? (parsed as { objects: unknown[] }).objects : [];
  const out: RawDetection[] = [];
  for (const item of rows) {
    if (!item || typeof item !== "object") continue;
    const row = item as Record<string, unknown>;
    const label = typeof row.label === "string" ? row.label.trim() : "";
    const category = OBJECT_CATEGORIES.find((entry) => entry === row.category);
    if (!label || !category) continue;
    const boxRaw = row.box && typeof row.box === "object" ? row.box as Record<string, unknown> : {};
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
      condition: row.condition === "ok" || row.condition === "damaged" || row.condition === "unclear" ? row.condition : "unclear",
      damageTypes: Array.isArray(row.damageTypes) ? row.damageTypes.filter((type): type is RawDetection["damageTypes"][number] => DAMAGE_TYPES.includes(type as never)) : [],
      severity: row.severity === "none" || row.severity === "minor" || row.severity === "moderate" || row.severity === "severe" ? row.severity : null,
      rationale: typeof row.rationale === "string" ? row.rationale : null,
    });
  }
  return out;
}
