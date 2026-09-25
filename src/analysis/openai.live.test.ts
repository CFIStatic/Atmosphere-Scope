import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { createIntervalQueue, type AddressLookup } from "@/analysis/pricing-check";
import { priceWithOpenAI } from "@/analysis/openai/pricing";
import { transcribeWithOpenAI } from "@/analysis/openai/transcribe";
import { identifyObjects } from "@/analysis/openai/vision";

const ROOT = path.resolve(__dirname, "../..");
const FIXTURES = path.join(ROOT, "fixtures", "providers");
const key = process.env.OPENAI_API_KEY?.trim() ?? "";
const fixtures = !key && process.env.OPENAI_PROVIDER_FIXTURES === "1";
const live = Boolean(key);

const publicLookup: AddressLookup = async () => [{ address: "93.184.216.34", family: 4 }];

function recorded(name: string): unknown {
  return JSON.parse(readFileSync(path.join(FIXTURES, name), "utf8"));
}

function bytes(name: string): Uint8Array {
  return new Uint8Array(readFileSync(path.join(FIXTURES, name)));
}

function assertNoSecret(value: unknown, secret: string) {
  if (secret && JSON.stringify(value).includes(secret)) throw new Error("A provider result included the API key.");
}

function fixtureFetch(): typeof fetch {
  return (async (input: RequestInfo | URL) => {
    const url = String(input);
    if (url.includes("/audio/transcriptions")) return Response.json(recorded("transcription.json"));
    if (url.includes("/chat/completions")) return Response.json(recorded("vision.json"));
    if (url.includes("/v1/responses")) return Response.json(recorded("pricing.json"));
    if (url === "https://shop.example/batteries") return new Response(readFileSync(path.join(FIXTURES, "page.html"), "utf8"), { status: 200 });
    throw new Error(`Unexpected provider URL: ${url}`);
  }) as typeof fetch;
}

describe.skipIf(!live && !fixtures)("OpenAI vision, transcription, and web-search pricing", () => {
  const secret = live ? key : "fixture-not-a-secret";
  const env = { OPENAI_API_KEY: secret };

  it("transcribes the recorded narration", async () => {
    const fetchImpl = live ? fetch : fixtureFetch();
    const result = await transcribeWithOpenAI({ filename: "narration.wav", bytes: bytes("narration.wav"), mimeType: "audio/wav" }, { env, fetchImpl });
    assertNoSecret(result, secret);
    expect(result.status).toBe("ok");
    expect(result.text && result.text.length).toBeGreaterThan(8);
    if (fixtures) expect(result.text).toMatch(/kitchen chair/i);
    if (live) expect(result.text).toMatch(/chair|kitchen|window/i);
    expect(result.note).not.toMatch(/not invented|failed \(/);
  });

  it("names an object in the recorded frame", async () => {
    const fetchImpl = live ? fetch : fixtureFetch();
    const result = await identifyObjects([{ name: "lamp.jpg", bytes: bytes("lamp.jpg"), mimeType: "image/jpeg" }], { env, fetchImpl });
    assertNoSecret(result, secret);
    expect(result.note).not.toMatch(/failed \(|invalid JSON|not set|No keyframes/);
    expect(result.objects.length).toBeGreaterThan(0);
    expect(result.objects[0]?.name).toBeTruthy();
    expect(["low", "medium", "high"]).toContain(result.objects[0]?.confidence);
    if (fixtures) expect(result.objects[0]?.name).toBe("Floor lamp");
  });

  it("checks a web-search replacement offer and does not invent a failed lookup", async () => {
    const fetchImpl = live ? fetch : fixtureFetch();
    const offer = await priceWithOpenAI("AA alkaline batteries 24 pack", {
      apiKey: secret,
      fetchImpl,
      now: new Date("2026-09-25T00:00:00.000Z"),
      env,
      page: live
        ? undefined
        : { fetchImpl, lookup: publicLookup, queue: createIntervalQueue(0), timeoutMs: 1000, maxBytes: 500_000 },
    });
    assertNoSecret(offer, secret);
    expect(offer.note).not.toMatch(/OpenAI pricing failed|Pricing request failed|did not return a usable offer/);
    expect(["verified", "unverified", "unpriced"]).toContain(offer.status);
    if (offer.price != null) {
      expect(offer.price).toBeGreaterThan(0);
      expect(offer.status === "verified" || offer.status === "unverified").toBe(true);
      expect(offer.url).toMatch(/^https?:\/\//);
    }
    if (fixtures) {
      expect(offer.status).toBe("verified");
      expect(offer.price).toBe(12.99);
      expect(offer.url).toBe("https://shop.example/batteries");
    }
  });
});
