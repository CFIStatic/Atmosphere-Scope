import { describe, expect, it } from "vitest";
import { applyJobAction } from "@/domain/actions";
import { importDepthPayload, type DepthPayload } from "@/spatial/depth";
import { createEmptyJob, runPipeline } from "./pipeline";
import { SCENARIOS, scenarioBundle } from "@/samples/scenarios";

function empty() {
  return createEmptyJob({
    address: "1 Test",
    city: "Madison",
    region: "WI",
    postalCode: "53703",
    customerName: "Test",
    phone: "",
    email: "",
    concern: "Check",
  });
}

describe("bugfixes", () => {
  it("keeps imported polygons and still adds newly analyzed rooms", () => {
    const scenario = SCENARIOS[0];
    const seeded = importDepthPayload(empty(), {
      format: "atmosphere-depth-v1",
      rooms: [{ name: "Laundry", polygonFt: [{ x: 2, y: 3 }, { x: 8, y: 3 }, { x: 8, y: 10 }, { x: 2, y: 10 }], heightFt: 9 }],
    } satisfies DepthPayload);
    const laundryId = seeded.rooms.find((room) => room.name === "Laundry")!.id;
    const ran = runPipeline(seeded, { ...scenarioBundle(scenario), usePriceBook: false });
    const laundry = ran.sketch.geometry.rooms.find((room) => room.roomId === laundryId);
    expect(laundry?.polygon).toEqual([
      { x: 2, y: 3 },
      { x: 8, y: 3 },
      { x: 8, y: 10 },
      { x: 2, y: 10 },
    ]);
    expect(laundry?.provenance).toBe("imported");
    expect(ran.rooms.some((room) => room.name === "Kitchen")).toBe(true);
    expect(ran.sketch.geometry.rooms.some((room) => room.roomId === ran.rooms.find((item) => item.name === "Kitchen")!.id)).toBe(true);
  });

  it("adds a newly analyzed room beside human-corrected geometry", () => {
    const scenario = SCENARIOS[2];
    let job = runPipeline(empty(), { ...scenarioBundle(scenario), usePriceBook: false });
    const room = job.sketch.geometry.rooms[0];
    job = applyJobAction(job, { type: "sketch", op: { type: "move_room", roomId: room.roomId, dx: 4, dy: 1 } });
    const moved = job.sketch.geometry.rooms.find((item) => item.roomId === room.roomId)!;
    const rerun = runPipeline(job, {
      ...scenarioBundle(scenario),
      transcripts: [
        ...job.transcripts,
        { id: "seg_extra", mediaId: job.media[0].id, startMs: 9000, endMs: 12000, text: "This is the dining room.", speaker: "narrator", injectionFlags: [], source: "user_supplied" },
      ],
      usePriceBook: false,
    });
    const kept = rerun.sketch.geometry.rooms.find((item) => item.roomId === room.roomId);
    expect(kept?.polygon).toEqual(moved.polygon);
    const dining = rerun.rooms.find((item) => item.name === "Dining Room");
    expect(dining).toBeTruthy();
    expect(rerun.sketch.geometry.rooms.some((item) => item.roomId === dining!.id)).toBe(true);
  });

  it("marks the failed stage failed", () => {
    const scenario = SCENARIOS.find((item) => item.id === "interrupted")!;
    const failed = runPipeline(empty(), { ...scenarioBundle(scenario), usePriceBook: true, failStage: "frames" });
    expect(failed.processing.status).toBe("failed");
    expect(failed.processing.stages.frames.status).toBe("failed");
    expect(failed.processing.stages.ingest.status).toBe("complete");
    expect(failed.processing.stages.analyze.status).toBe("pending");
    expect(failed.processing.stages.frames.message).toMatch(/Frame analysis/);
  });

  it("creates a job room when a sketch room is split", () => {
    const scenario = SCENARIOS[2];
    const job = runPipeline(empty(), { ...scenarioBundle(scenario), usePriceBook: false });
    const room = job.sketch.geometry.rooms[0];
    const next = applyJobAction(job, { type: "sketch", op: { type: "split_room", roomId: room.roomId, newRoomId: `split_${room.roomId}`, along: "x", ratio: 0.5 } });
    const created = next.rooms.find((item) => item.id === `split_${room.roomId}`);
    expect(created?.name).toContain("split");
    expect(created?.floorId).toBe(job.rooms.find((item) => item.id === room.roomId)?.floorId);
    expect(next.sketch.geometry.rooms.some((item) => item.roomId === created?.id)).toBe(true);
  });
});
