import { mkdtemp, readFile, rm } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { captureStatusLabel, missingIndices } from "@/capture/plan";
import { resumeCapture } from "@/capture/resume-client";
import { createUploadStore } from "@/capture/uploads";
import type { CaptureRecord } from "@/capture/db";

const roots: string[] = [];

afterEach(async () => {
  await Promise.all(roots.splice(0).map((root) => rm(root, { recursive: true, force: true })));
});

function record(overrides: Partial<CaptureRecord> = {}): CaptureRecord {
  return {
    id: "cap-1",
    filename: "walk.webm",
    mime: "video/webm",
    createdAt: "2026-09-25T00:00:00.000Z",
    status: "saved",
    totalChunks: 3,
    uploadId: null,
    error: null,
    ...overrides,
  };
}

describe("capture status", () => {
  it("names the offline recording and the resumable upload", () => {
    expect(missingIndices([0, 2], 3)).toEqual([1]);
    expect(captureStatusLabel({ online: false, phase: "recording", sent: 0, total: 0 })).toBe(
      "Offline. Still recording. This phone keeps the video until a connection returns.",
    );
    expect(captureStatusLabel({ online: false, phase: "saved", sent: 0, total: 2 })).toBe(
      "Saved on this phone. Upload waits for a connection.",
    );
    expect(captureStatusLabel({ online: true, phase: "uploading", sent: 1, total: 4 })).toBe(
      "Uploading 1 of 4 chunks. Measurement stays on the server.",
    );
    expect(captureStatusLabel({ online: true, phase: "processing", sent: 2, total: 2 })).toBe(
      "Upload complete. Processing on the server.",
    );
    expect(captureStatusLabel({ online: false, phase: "error", sent: 0, total: 1 })).toBe(
      "Upload paused. It will retry when the connection returns.",
    );
  });
});

describe("upload store", () => {
  it("resumes from the first missing chunk and assembles in order", async () => {
    const root = await mkdtemp(path.join(os.tmpdir(), "scope-uploads-"));
    roots.push(root);
    const store = createUploadStore(root);
    const id = await store.create({ filename: "walk.webm", mime: "video/webm", totalChunks: 3 });
    await store.writeChunk(id, 0, Buffer.from("aa"));
    await store.writeChunk(id, 2, Buffer.from("cc"));
    const partial = await store.status(id);
    expect(partial.nextIndex).toBe(1);
    expect(partial.complete).toBe(false);
    await expect(store.assemble(id, path.join(root, "out.bin"))).rejects.toThrow(/missing chunks/);
    await store.writeChunk(id, 1, Buffer.from("bb"));
    const dest = path.join(root, "out.bin");
    await store.assemble(id, dest);
    expect(await readFile(dest, "utf8")).toBe("aabbcc");
    await expect(store.status("not-a-uuid")).rejects.toThrow(/Unknown upload/);
  });
});

describe("resume client", () => {
  it("does not upload while offline", async () => {
    let calls = 0;
    const body = await resumeCapture(record(), {
      online: false,
      fetchImpl: (async () => {
        calls += 1;
        return new Response("no");
      }) as typeof fetch,
      onStatus: () => undefined,
      readChunk: async () => new Blob(["x"]),
      putCapture: async () => undefined,
    });
    expect(body).toBeNull();
    expect(calls).toBe(0);
  });

  it("sends only missing chunks and starts over when the server forgot the upload", async () => {
    const puts: CaptureRecord[] = [];
    const sent: string[] = [];
    const chunks = [new Blob(["aa"]), new Blob(["bb"]), new Blob(["cc"])];
    let statusHits = 0;
    const fetchImpl = (async (input: RequestInfo | URL, init?: RequestInit) => {
      const url = String(input);
      if (init?.method === "POST" && url.endsWith("/uploads")) return Response.json({ id: statusHits === 0 ? "gone" : "11111111-1111-4111-8111-111111111111" });
      if (init?.method === "GET" || !init?.method) {
        statusHits += 1;
        if (statusHits === 1) return new Response("missing", { status: 404 });
        return Response.json({ received: [0] });
      }
      if (init.method === "PUT") {
        sent.push(init.headers instanceof Headers ? init.headers.get("x-chunk-index") ?? "" : String(new Headers(init.headers).get("x-chunk-index")));
        return Response.json({ ok: true });
      }
      if (url.endsWith("/finish")) return Response.json({ method: "charuco_multiview", dimensions: [] });
      return new Response("no", { status: 500 });
    }) as typeof fetch;
    const saved = record({ uploadId: "old-upload", totalChunks: 3 });
    const body = await resumeCapture(saved, {
      online: true,
      fetchImpl,
      onStatus: () => undefined,
      readChunk: async (_id, index) => chunks[index] ?? null,
      putCapture: async (next) => {
        puts.push(next);
      },
    });
    expect(sent).toEqual(["1", "2"]);
    expect(body).toMatchObject({ method: "charuco_multiview" });
    expect(puts.at(-1)?.status).toBe("done");
    expect(puts.some((item) => item.uploadId === "11111111-1111-4111-8111-111111111111")).toBe(true);
  });
});
