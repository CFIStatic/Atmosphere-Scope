import { mkdtemp, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import type { WalkthroughSnapshot } from "@/capture/snapshot";
import { getWalkthrough, storeWalkthrough } from "./walkthrough-store";

const snapshot = { plan: { rooms: [], quantities: [] } } as unknown as WalkthroughSnapshot;
const previousData = process.env.DATA_DIR;
const previousStorage = process.env.STORAGE;

afterEach(() => {
  if (previousData === undefined) delete process.env.DATA_DIR;
  else process.env.DATA_DIR = previousData;
  if (previousStorage === undefined) delete process.env.STORAGE;
  else process.env.STORAGE = previousStorage;
});

describe("walkthrough files", () => {
  it("rejects an id that would write outside the walkthrough directory", async () => {
    const dir = await mkdtemp(path.join(tmpdir(), "walk-"));
    process.env.DATA_DIR = dir;
    process.env.STORAGE = "local";
    try {
      await expect(storeWalkthrough("../jobs/other", snapshot, null)).rejects.toThrow(/not valid/);
      await expect(storeWalkthrough("../../outside", snapshot, null)).rejects.toThrow(/not valid/);
      expect(await getWalkthrough("../jobs/other")).toBeNull();
      await expect(readFile(path.join(dir, "jobs", "other.json"), "utf8")).rejects.toThrow();
      const saved = await storeWalkthrough("job-1", snapshot, null);
      expect(saved.id).toBe("job-1");
      const raw = JSON.parse(await readFile(path.join(dir, "walkthroughs", "job-1.json"), "utf8")) as { id: string };
      expect(raw.id).toBe("job-1");
    } finally {
      await rm(dir, { recursive: true, force: true });
    }
  });
});
