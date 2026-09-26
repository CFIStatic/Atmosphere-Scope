import { mkdtemp, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { hammingDistanceHex, selectDiverseFrames } from "./frame-diversity";
import { extractFrames, probeMetadata, type CommandRunner } from "./extract";
import { clipWindows } from "./clips";
import { coverageOf, downgradeUnseen, segmentFrames } from "./long-analyst";
import { formatVerboseTranscript, stampClock, transcriptAlreadyStamped } from "./transcription";
import { OPENAI_TRANSCRIPTIONS_URL, resolveTranscriptionConfig, transcriptionConfigured } from "./transcription-config";
import { parseVerbatimTranscript } from "./verbatim-transcript";
import { dedupeEvidenceLog } from "./evidence-log";
import { fuseEvidence, parseFusionEntries } from "./evidence-fusion";
import { visionProviderLabel } from "./vision-provider";
import { admitMotionClip } from "./motion-clips";
import { answerClipQuestion } from "./clip-ask";
import { needsAnalysisReclaim } from "./sweep";
import { claimNext, completeJob, failJob, type AnalysisJobRow } from "./lease";
import { claimJob, memoryStore } from "./job-queue";
import { expectedModeMinuteUsd, expectedWalkthroughMinuteUsd, tokensToUsd } from "./cost";
import { analysisPollMs } from "./supervisor";
import { publicAnalysisStatus } from "./status";
import { analysisMode, auditRate, escalateBelow, inventoryVisionModel, triageVisionModel } from "@/analysis/config";
import { prepareFrames } from "./intelligence";
import { stitchWindowTranscripts, transcriptWindows } from "./proof-transcript";
import { cropFilter } from "@/analysis/objects/tiles";

function solid(level: number, size = 12_000): Buffer {
  const buf = Buffer.alloc(size);
  buf.fill(level);
  const stripe = (level * 13 + 7) % 40 + 3;
  for (let i = 0; i < size; i += 1) {
    if (Math.floor(i / 3) % stripe === 0) buf[i] = (level + 90) % 256;
    if (i % (stripe * 9) === 0) buf[i] = (255 - level) % 256;
  }
  return buf;
}

function row(id: string, overrides: Partial<AnalysisJobRow> = {}): AnalysisJobRow {
  return {
    id, jobId: "job", mediaId: "med", status: "pending", attempts: 0, maxAttempts: 3,
    leaseOwner: null, leaseUntil: null, lastError: null, stage: null, orgId: null, actorEmail: null, updatedAt: "2026-09-26T00:00:00.000Z",
    ...overrides,
  };
}

describe("ported video infrastructure", () => {
  it("drops duplicate frames and keeps a real change", () => {
    const same = solid(40);
    const kept = selectDiverseFrames([
      { atSeconds: 0, jpeg: same },
      { atSeconds: 600, jpeg: Buffer.from(same) },
      { atSeconds: 1200, jpeg: Buffer.from(same) },
    ], { maxFrames: 20, hammingThreshold: 8, coverageIntervalSeconds: 3600 });
    expect(kept.length).toBeLessThanOrEqual(2);
    expect(kept[0]?.reason).toBe("first");
    const changed = selectDiverseFrames([
      { atSeconds: 0, jpeg: solid(20) },
      { atSeconds: 60, jpeg: solid(20) },
      { atSeconds: 120, jpeg: solid(200) },
    ], { maxFrames: 20, hammingThreshold: 8, coverageIntervalSeconds: 3600 });
    expect(changed.some((frame) => frame.reason === "changed")).toBe(true);
    expect(hammingDistanceHex(changed[0]!.perceptualHash, changed[1]!.perceptualHash)).toBeGreaterThan(8);
  });

  it("reads ffprobe JSON and frame files through an injected runner", async () => {
    const dir = await mkdtemp(join(tmpdir(), "scope-frames-"));
    const runner: CommandRunner = async (_bin, args) => {
      if (args.includes("-print_format")) {
        return { code: 0, stdout: JSON.stringify({ format: { duration: "12.5" }, streams: [{ codec_type: "video", codec_name: "h264", width: 1920, height: 1080, avg_frame_rate: "30/1" }] }), stderr: "" };
      }
      await writeFile(join(dir, "frame_00001.jpg"), Buffer.from("a"));
      await writeFile(join(dir, "frame_00002.jpg"), Buffer.from("b"));
      return { code: 0, stdout: "", stderr: "" };
    };
    const meta = await probeMetadata("clip.mp4", runner);
    expect(meta.durationSeconds).toBe(12.5);
    expect(meta.fps).toBe(30);
    const frames = await extractFrames({ filePath: "clip.mp4", outDir: dir, durationSeconds: 12.5, intervalSeconds: 1, maxFrames: 4, runner });
    expect(frames.map((frame) => frame.timestampSeconds)).toEqual([0, 1]);
  });

  it("windows clips, segments long recordings, and drops unseen scope lines", () => {
    expect(clipWindows([{ id: "c1", frameIds: ["a"], timestamps: [4, 6] }])[0]).toMatchObject({ startSeconds: 3, endSeconds: 7 });
    const windows = segmentFrames([{ atSeconds: 0 }, { atSeconds: 10 }, { atSeconds: 4000 }], { maxFrames: 2, maxSeconds: 30 });
    expect(windows.length).toBeGreaterThan(1);
    const readings = [{ scopeTouched: [0], couldNotTell: [] }];
    expect(downgradeUnseen([0, 1], readings)).toEqual([0]);
    expect(coverageOf(0, windows, readings).seen).toBe(1);
  });

  it("stamps transcripts and defaults speech to OpenAI", () => {
    const text = formatVerboseTranscript({ segments: [{ start: 0, text: "Leave the cabinets." }, { start: 12.4, text: "Understood." }] }, 600);
    expect(text).toBe("[10:00] Leave the cabinets.\n[10:12] Understood.");
    expect(transcriptAlreadyStamped(text)).toBe(true);
    expect(stampClock(65)).toBe("1:05");
    const cfg = resolveTranscriptionConfig({ OPENAI_API_KEY: "sk-test" });
    expect(cfg.url).toBe(OPENAI_TRANSCRIPTIONS_URL);
    expect(cfg.model).toBe("gpt-4o-mini-transcribe");
    expect(transcriptionConfigured(cfg)).toBe(true);
    expect(resolveTranscriptionConfig({}).url).toBe("");
    expect(parseVerbatimTranscript(text)[1]?.tSec).toBe(612);
    expect(stitchWindowTranscripts([{ start: 600, body: { segments: [{ start: 1, text: "Wet to two feet." }] } }])).toContain("[10:01]");
    expect(transcriptWindows(1200, 600)).toHaveLength(2);
  });

  it("dedupes evidence, grounds a verbatim quote, and refuses an unquoted answer", () => {
    const deduped = dedupeEvidenceLog([
      { atSeconds: 1, text: "The wall is wet to 2 feet along 10 feet.", type: "said" },
      { atSeconds: 1.2, text: "The wall is wet to 2 feet along 10 feet.", type: "said" },
    ]);
    expect(deduped).toHaveLength(1);
    const fused = fuseEvidence({ entries: [], transcript: "The wall is wet to 2 feet along 10 feet.", narration: "The wall is wet to 2 feet along 10 feet in the kitchen." });
    expect(fused[0]?.quote).toBe("The wall is wet to 2 feet along 10 feet.");
    expect(parseFusionEntries("nope")).toEqual([]);
    expect(answerClipQuestion("What is the price?", "The wall is wet.").grounded).toBe(false);
    expect(answerClipQuestion("Is the wall wet?", "The wall is wet to 2 feet.").quote).toContain("wet");
  });

  it("keeps OpenAI as the only vision provider and drops weak motion clips", () => {
    expect(visionProviderLabel({ OPENAI_API_KEY: "sk-test", GEMINI_API_KEY: "g" })).toBe("openai");
    expect(visionProviderLabel({})).toBe("unconfigured");
    expect(admitMotionClip({ description: "", verb: "cut", confidence: 0.9, atSeconds: 1 })).toBeNull();
    expect(admitMotionClip({ description: "Cutting baseboard", verb: "saw", confidence: 0.2, atSeconds: 1 })).toBeNull();
    expect(admitMotionClip({ description: "Cutting baseboard", verb: "saw", confidence: 0.8, atSeconds: 3, privacyRanges: [{ start: 2, end: 4 }] })).toBeNull();
    expect(admitMotionClip({ description: "Cutting baseboard", verb: "saw", confidence: 0.8, atSeconds: 1 })?.verb).toBe("cut");
  });

  it("reclaims an expired lease and stops after the attempt budget", async () => {
    expect(needsAnalysisReclaim("running")).toBe(true);
    expect(needsAnalysisReclaim("complete")).toBe(false);
    const now = Date.parse("2026-09-26T12:00:00.000Z");
    const held = row("a", { status: "running", leaseOwner: "other", leaseUntil: new Date(now + 60_000).toISOString() });
    const expired = row("b", { status: "running", leaseOwner: "other", leaseUntil: new Date(now - 1000).toISOString() });
    const first = claimNext([held, expired], now, "worker-2", 30_000);
    expect(first?.claimed.id).toBe("b");
    expect(first?.claimed.leaseOwner).toBe("worker-2");
    const store = memoryStore([row("c")]);
    const claimed = await claimJob(store, now, "worker", 1000);
    expect(claimed?.status).toBe("running");
    expect(await claimJob(store, now, "other", 1000)).toBeNull();
    let rows = failJob(await store.list(), "c", now, "ffmpeg missing");
    expect(rows[0]?.status).toBe("pending");
    expect(rows[0]?.attempts).toBe(1);
    rows = failJob(rows, "c", now, "again");
    rows = failJob(rows, "c", now, "third");
    expect(rows[0]?.status).toBe("failed");
    expect(completeJob(rows, "c", now)[0]?.status).toBe("complete");
    const diverse = prepareFrames([{ atSeconds: 0, jpeg: solid(10) }, { atSeconds: 1, jpeg: solid(10) }], { durationSeconds: 30, maxFrames: 4 });
    expect(diverse.length).toBe(1);
    expect(cropFilter({ x: 0, y: 0, width: 0.5, height: 0.5 }, 100, 80)).toBe("crop=50:40:0:0");
  });

  it("prices a planning minute from list rates without treating it as an invoice", () => {
    const minute = expectedWalkthroughMinuteUsd();
    expect(minute.model).toBe("gpt-6-astra");
    expect(minute.totalUsd).toBeGreaterThan(1.5);
    expect(minute.totalUsd).toBeLessThan(1.6);
    expect(minute.transcribeUsd).toBe(0.003);
    expect(tokensToUsd(0, 0)).toBe(0);
    expect(tokensToUsd(1_000_000, 0, "gpt-4o-mini")).toBe(0.15);
    expect(minute.distinctFrames).toBe(12);
    expect(inventoryVisionModel({})).toBe("gpt-6-astra");
    expect(inventoryVisionModel({ OPENAI_VISION_MODEL: "gpt-4o-mini" })).toBe("gpt-4o-mini");
    expect(triageVisionModel({})).toBe("gpt-4o-mini");
    expect(analysisMode({})).toBe("cascade");
    expect(escalateBelow({})).toBe(0.75);
    expect(auditRate({})).toBe(0.1);
    expect(expectedModeMinuteUsd("cheap").totalUsd).toBeCloseTo(0.02316, 5);
    expect(expectedModeMinuteUsd("cascade").totalUsd).toBeCloseTo(0.27916, 5);
    expect(expectedModeMinuteUsd("strong").totalUsd).toBeCloseTo(minute.totalUsd, 5);
    expect(publicAnalysisStatus({ status: "pending", stage: "queued" })).toBe("queued");
    expect(publicAnalysisStatus({ status: "running", stage: "inventorying" })).toBe("inventorying");
    expect(publicAnalysisStatus({ status: "failed", stage: "failed" })).toBe("failed");
    expect(analysisPollMs({})).toBe(4000);
  });
});
