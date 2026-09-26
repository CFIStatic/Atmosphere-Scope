import { noteModelUse } from "@/analysis/usage-log";
import { openaiKey, redact, visionModel, type Env } from "@/analysis/config";
import { frameTimeMs, selectKeyframes, type EvidenceLink, type IdentifiedObject } from "@/analysis/frames";
import { screenText } from "@/analysis/guard";

export { frameTimeMs, selectKeyframes, type EvidenceLink, type IdentifiedObject } from "@/analysis/frames";
export { MAX_VISION_FRAMES } from "@/analysis/frames";

export const MAX_OBJECTS = 24;
export const MAX_PRICED_OBJECTS = 8;

export function dedupeObjects(items: IdentifiedObject[]): IdentifiedObject[] {
  const rank = { low: 0, medium: 1, high: 2 } as const;
  const map = new Map<string, IdentifiedObject>();
  for (const item of items) {
    const key = item.name.toLowerCase().replace(/\s+/g, " ").replace(/[.\s]+$/g, "");
    if (!key) continue;
    const existing = map.get(key);
    if (!existing) {
      map.set(key, { ...item, name: item.name.trim() });
      continue;
    }
    map.set(key, {
      ...existing,
      frames: [...new Set([...existing.frames, ...item.frames])],
      links: mergeLinks(existing.links, item.links),
      confidence: rank[item.confidence] > rank[existing.confidence] ? item.confidence : existing.confidence,
      room: existing.room ?? item.room,
      evidence: existing.evidence || item.evidence,
    });
  }
  return [...map.values()].slice(0, MAX_OBJECTS);
}

export function parseVisionObjects(raw: unknown, frameNames: string[]): IdentifiedObject[] {
  if (!raw || typeof raw !== "object" || !Array.isArray((raw as { objects?: unknown }).objects)) return [];
  const parsed: IdentifiedObject[] = [];
  for (const item of (raw as { objects: unknown[] }).objects) {
    if (!item || typeof item !== "object") continue;
    const record = item as Record<string, unknown>;
    const name = typeof record.name === "string" ? record.name.trim() : "";
    if (!name) continue;
    const evidence = typeof record.evidence === "string" ? record.evidence.trim() : "";
    const blocked = screenText(`${name} ${evidence}`).some((flag) => flag.id === "invent_price" || flag.id === "force_approval" || flag.id === "ignore_instructions");
    if (blocked) continue;
    const confidence = record.confidence === "high" || record.confidence === "medium" || record.confidence === "low" ? record.confidence : "low";
    const room = typeof record.room === "string" && record.room.trim() ? record.room.trim() : null;
    parsed.push({ name, room, evidence, confidence, frames: frameNames, links: linksFromFrames(frameNames) });
  }
  return dedupeObjects(parsed);
}

export function mergeLinks(left: EvidenceLink[] | undefined, right: EvidenceLink[] | undefined): EvidenceLink[] {
  const map = new Map<string, EvidenceLink>();
  for (const link of [...(left ?? []), ...(right ?? [])]) map.set(`${link.frame}:${link.timeMs ?? ""}`, link);
  return [...map.values()];
}

function linksFromFrames(frames: string[]): EvidenceLink[] {
  return frames.map((frame) => ({ frame, timeMs: frameTimeMs(frame) }));
}

export function extractChatContent(body: unknown): string | null {
  if (!body || typeof body !== "object") return null;
  const choices = (body as { choices?: unknown }).choices;
  if (!Array.isArray(choices) || !choices[0] || typeof choices[0] !== "object") return null;
  const content = (choices[0] as { message?: { content?: unknown } }).message?.content;
  return typeof content === "string" && content.trim() ? content : null;
}

export async function identifyObjects(
  frames: { name: string; bytes: Uint8Array; mimeType: string }[],
  options: { env?: Env; fetchImpl?: typeof fetch; jobId?: string | null } = {},
): Promise<{ objects: IdentifiedObject[]; note: string }> {
  const env = options.env ?? process.env;
  const key = openaiKey(env);
  if (!key) return { objects: [], note: "OPENAI_API_KEY is not set. Objects were not invented." };
  const chosen = selectKeyframes(frames.filter((frame) => frame.bytes.byteLength > 0));
  if (!chosen.length) return { objects: [], note: "No keyframes were available, so no objects were identified." };
  const fetchImpl = options.fetchImpl ?? fetch;
  try {
    const response = await fetchImpl("https://api.openai.com/v1/chat/completions", {
      method: "POST",
      headers: { Authorization: `Bearer ${key}`, "Content-Type": "application/json" },
      body: JSON.stringify({
        model: visionModel(env),
        response_format: {
          type: "json_schema",
          json_schema: {
            name: "visible_objects",
            strict: true,
            schema: {
              type: "object",
              additionalProperties: false,
              required: ["objects"],
              properties: {
                objects: {
                  type: "array",
                  items: {
                    type: "object",
                    additionalProperties: false,
                    required: ["name", "room", "evidence", "confidence"],
                    properties: {
                      name: { type: "string" },
                      room: { anyOf: [{ type: "string" }, { type: "null" }] },
                      evidence: { type: "string" },
                      confidence: { type: "string", enum: ["low", "medium", "high"] },
                    },
                  },
                },
              },
            },
          },
        },
        messages: [
          {
            role: "user",
            content: [
              {
                type: "text",
                text: "List distinct household objects that are actually visible in these frames. Deduplicate across frames. Do not include prices, dimensions, repair costs, or objects you cannot see. Room is null when you cannot tell which room it is. Evidence is what in the frame supports the name.",
              },
              ...chosen.map((frame) => ({
                type: "image_url",
                image_url: { url: `data:${frame.mimeType || "image/jpeg"};base64,${Buffer.from(frame.bytes).toString("base64")}` },
              })),
            ],
          },
        ],
      }),
    });
    const payload = await response.json().catch(() => null);
    await noteModelUse(payload, visionModel(env), options.jobId);
    if (!response.ok) return { objects: [], note: `Object identification failed (${response.status}). Objects were not invented.` };
    const text = extractChatContent(payload);
    if (!text) return { objects: [], note: "Object identification returned no list. Objects were not invented." };
    let parsed: unknown;
    try {
      parsed = JSON.parse(text);
    } catch {
      return { objects: [], note: "Object identification returned invalid JSON. Objects were not invented." };
    }
    const objects = parseVisionObjects(parsed, chosen.map((frame) => frame.name));
    return {
      objects,
      note: objects.length ? "Names come from a vision model. They can be wrong, and they are not measurements." : "No object passed validation. Nothing was invented.",
    };
  } catch (error) {
    return { objects: [], note: `${redact(error instanceof Error ? error.message : "Object identification failed.")} Objects were not invented.` };
  }
}
