import { createReadStream, createWriteStream } from "node:fs";
import { mkdir, readFile, rm, stat, writeFile } from "node:fs/promises";
import path from "node:path";
import { pipeline } from "node:stream/promises";
import { dataRoot } from "@/storage/paths";

const ID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const MAX_CHUNKS = 20_000;
const MAX_CHUNK_BYTES = 8 * 1024 * 1024;
const MAX_TOTAL_BYTES = 512 * 1024 * 1024;

export type UploadMeta = {
  filename: string;
  mime: string;
  totalChunks: number;
  sizes: Record<string, number>;
};

export type UploadStatus = {
  id: string;
  received: number[];
  nextIndex: number;
  totalChunks: number;
  bytes: number;
  complete: boolean;
};

export function assertUploadId(id: string): string {
  if (!ID_RE.test(id)) throw new Error("Unknown upload.");
  return id;
}

export function createUploadStore(root = path.join(dataRoot(), "uploads")) {
  async function directory(id: string): Promise<string> {
    const safe = assertUploadId(id);
    const dir = path.join(root, safe);
    if (path.relative(root, dir).startsWith("..")) throw new Error("Unknown upload.");
    return dir;
  }

  async function readMeta(id: string): Promise<UploadMeta> {
    try {
      const raw = await readFile(path.join(await directory(id), "meta.json"), "utf8");
      return JSON.parse(raw) as UploadMeta;
    } catch (error) {
      if (error instanceof Error && error.message === "Unknown upload.") throw error;
      throw new Error("Unknown upload.");
    }
  }

  return {
    root,
    async create(input: { filename: string; mime: string; totalChunks: number }): Promise<string> {
      if (!Number.isInteger(input.totalChunks) || input.totalChunks < 1 || input.totalChunks > MAX_CHUNKS) {
        throw new Error("That upload has no chunks.");
      }
      const id = crypto.randomUUID();
      const dir = await directory(id);
      await mkdir(dir, { recursive: true });
      const meta: UploadMeta = {
        filename: input.filename.slice(0, 200) || "walkthrough.webm",
        mime: input.mime.slice(0, 100) || "video/webm",
        totalChunks: input.totalChunks,
        sizes: {},
      };
      await writeFile(path.join(dir, "meta.json"), JSON.stringify(meta));
      return id;
    },
    async writeChunk(id: string, index: number, bytes: Uint8Array): Promise<UploadStatus> {
      const meta = await readMeta(id);
      if (!Number.isInteger(index) || index < 0 || index >= meta.totalChunks) throw new Error("Chunk index is outside this upload.");
      if (bytes.byteLength === 0 || bytes.byteLength > MAX_CHUNK_BYTES) throw new Error("Chunk size is not accepted.");
      const nextSizes = { ...meta.sizes, [String(index)]: bytes.byteLength };
      const total = Object.values(nextSizes).reduce((sum, size) => sum + size, 0);
      if (total > MAX_TOTAL_BYTES) throw new Error("Upload is larger than 512 MB.");
      const dir = await directory(id);
      await writeFile(path.join(dir, chunkName(index)), bytes);
      meta.sizes = nextSizes;
      await writeFile(path.join(dir, "meta.json"), JSON.stringify(meta));
      return statusFrom(id, meta);
    },
    async status(id: string): Promise<UploadStatus> {
      return statusFrom(id, await readMeta(id));
    },
    async assemble(id: string, dest: string): Promise<UploadMeta> {
      const meta = await readMeta(id);
      const current = statusFrom(id, meta);
      if (!current.complete) throw new Error("Upload is still missing chunks.");
      const dir = await directory(id);
      await mkdir(path.dirname(dest), { recursive: true });
      const output = createWriteStream(dest);
      for (let index = 0; index < meta.totalChunks; index += 1) {
        await pipeline(createReadStream(path.join(dir, chunkName(index))), output, { end: false });
      }
      await new Promise<void>((resolve, reject) => {
        output.end(() => resolve());
        output.on("error", reject);
      });
      return meta;
    },
    async remove(id: string): Promise<void> {
      await rm(await directory(id), { recursive: true, force: true });
    },
  };
}

function statusFrom(id: string, meta: UploadMeta): UploadStatus {
  const received = Object.keys(meta.sizes).map(Number).filter((index) => Number.isInteger(index)).sort((a, b) => a - b);
  const have = new Set(received);
  let nextIndex = 0;
  while (nextIndex < meta.totalChunks && have.has(nextIndex)) nextIndex += 1;
  const bytes = Object.values(meta.sizes).reduce((sum, size) => sum + size, 0);
  return { id, received, nextIndex, totalChunks: meta.totalChunks, bytes, complete: nextIndex === meta.totalChunks };
}

function chunkName(index: number): string {
  return `chunk-${String(index).padStart(6, "0")}`;
}

export async function uploadExists(id: string, root = path.join(dataRoot(), "uploads")): Promise<boolean> {
  try {
    const info = await stat(path.join(root, assertUploadId(id), "meta.json"));
    return info.isFile();
  } catch {
    return false;
  }
}
