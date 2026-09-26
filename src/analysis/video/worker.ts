/**
 * Claim one analysis job, inventory the video, and write objects back on the job.
 * Frame extraction is Atmosphere's ffmpeg path. Vision and speech stay on OpenAI.
 * Measurement is not redone here; quantities come from narration or geometry already on the job.
 */

import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { hostname } from "node:os";
import { createId } from "@/domain/ids";
import type { Job, TranscriptSegment } from "@/domain/types";
import { runPipeline } from "@/analysis/pipeline";
import { inventoryFrame } from "@/analysis/openai/inventory";
import { transcribeWithOpenAI } from "@/analysis/openai/transcribe";
import { roomAt } from "@/analysis/objects/narration";
import { cropFilter, planTiles, tileBox } from "@/analysis/objects/tiles";
import type { RawDetection } from "@/analysis/objects/detect";
import { parseVerbatimTranscript } from "./verbatim-transcript";
import { defaultRunner, extractFrames, probeMetadata, type CommandRunner } from "./extract";
import { prepareFrames } from "./intelligence";
import { costLog } from "./cost";
import { claimJob, updateJobRow, type AnalysisJobStore } from "./job-queue";
import type { AnalysisJobRow } from "./lease";
import { analysisEventSummary, publicAnalysisStatus } from "./status";
import type { UsageAttribution } from "@/analysis/usage-log";
import { addJobEvent } from "@/storage/workspace-book";

export function leaseOwner(): string {
  return `${hostname()}:${process.pid}`;
}

export function leaseMs(env: Record<string, string | undefined> = process.env): number {
  const value = Number(env.ANALYSIS_LEASE_MS);
  return Number.isFinite(value) && value >= 10_000 ? value : 120_000;
}

class LeaseLost extends Error {
  constructor() {
    super("Analysis lease was lost.");
    this.name = "LeaseLost";
  }
}

export async function tickAnalysisQueue(input: {
  store: AnalysisJobStore;
  loadJob: (id: string) => Promise<Job | null>;
  saveJob: (job: Job) => Promise<Job>;
  readMedia: (storageKey: string) => Promise<Buffer | null>;
  nowMs?: number;
  runner?: CommandRunner;
  env?: Record<string, string | undefined>;
  fetchImpl?: typeof fetch;
}): Promise<{ claimed: string | null; status: "idle" | "complete" | "retry" }> {
  const nowMs = input.nowMs ?? Date.now();
  const holdMs = leaseMs(input.env);
  const owner = leaseOwner();
  const claimed = await claimJob(input.store, nowMs, owner, holdMs);
  if (!claimed) return { claimed: null, status: "idle" };
  const attribution: UsageAttribution = { orgId: claimed.orgId, userEmail: claimed.actorEmail ?? "" };
  let lost = false;
  let gate = Promise.resolve();
  const extend = () => {
    const run = gate.then(async () => {
      const ok = await updateJobRow(input.store, claimed.id, {
        leaseOwner: owner,
        leaseUntil: new Date(Date.now() + holdMs).toISOString(),
      }, owner);
      if (!ok) lost = true;
    });
    gate = run.then(() => undefined, () => undefined);
    return run;
  };
  const beat = setInterval(() => { void extend().catch(() => undefined); }, Math.max(5_000, Math.floor(holdMs / 3)));
  const stopBeat = async () => {
    clearInterval(beat);
    await gate;
  };
  try {
    const job = await input.loadJob(claimed.jobId);
    if (!job) throw new Error("Job was not found.");
    const media = job.media.find((item) => item.id === claimed.mediaId);
    if (!media?.storageKey) throw new Error("Video file was not found.");
    const bytes = await input.readMedia(media.storageKey);
    if (!bytes?.byteLength) throw new Error("Video file was empty.");
    const analyzed = await analyzeVideoBytes({
      bytes,
      filename: media.filename,
      mimeType: media.mimeType,
      mediaId: media.id,
      job,
      runner: input.runner,
      env: input.env,
      fetchImpl: input.fetchImpl,
      attribution,
      onStage: (stage) => reportAnalysisStage(input.store, claimed, stage, input.env),
      keepAlive: async () => {
        await extend();
        if (lost) throw new LeaseLost();
      },
    });
    await stopBeat();
    if (lost) return { claimed: claimed.id, status: "retry" };
    await extend();
    if (lost) return { claimed: claimed.id, status: "retry" };
    await input.saveJob(analyzed);
    const settled = await updateJobRow(input.store, claimed.id, { status: "complete", leaseOwner: null, leaseUntil: null, lastError: null, stage: "complete" }, owner);
    if (!settled) return { claimed: claimed.id, status: "retry" };
    await recordAnalysisEvent(claimed, "done");
    return { claimed: claimed.id, status: "complete" };
  } catch (error) {
    await stopBeat();
    if (error instanceof LeaseLost || lost) return { claimed: claimed.id, status: "retry" };
    const message = error instanceof Error ? error.message : "Analysis failed.";
    const attempts = claimed.attempts + 1;
    const exhausted = attempts >= claimed.maxAttempts;
    await updateJobRow(input.store, claimed.id, {
      attempts,
      status: exhausted ? "failed" : "pending",
      leaseOwner: null,
      leaseUntil: null,
      lastError: message.slice(0, 500),
      stage: exhausted ? "failed" : "retry",
    }, owner);
    if (exhausted) await recordAnalysisEvent(claimed, "failed", message.slice(0, 240));
    return { claimed: claimed.id, status: "retry" };
  } finally {
    clearInterval(beat);
  }
}

async function reportAnalysisStage(store: AnalysisJobStore, claimed: AnalysisJobRow, stage: "extracting" | "inventorying" | "assessing" | "pricing", env?: Record<string, string | undefined>): Promise<void> {
  const owner = leaseOwner();
  const ok = await updateJobRow(store, claimed.id, {
    stage,
    leaseOwner: owner,
    leaseUntil: new Date(Date.now() + leaseMs(env)).toISOString(),
  }, owner);
  if (!ok) throw new LeaseLost();
  await recordAnalysisEvent(claimed, publicAnalysisStatus({ status: "running", stage }));
}

async function recordAnalysisEvent(claimed: AnalysisJobRow, status: "queued" | "extracting" | "inventorying" | "assessing" | "pricing" | "done" | "failed", error?: string): Promise<void> {
  await addJobEvent({
    jobId: claimed.jobId,
    orgId: claimed.orgId,
    actorEmail: claimed.actorEmail ?? "",
    summary: analysisEventSummary(status, error),
  }).catch(() => undefined);
}

export async function analyzeVideoBytes(input: {
  bytes: Buffer;
  filename: string;
  mimeType: string;
  mediaId: string;
  job: Job;
  runner?: CommandRunner;
  env?: Record<string, string | undefined>;
  fetchImpl?: typeof fetch;
  attribution?: UsageAttribution;
  onStage?: (stage: "extracting" | "inventorying" | "assessing" | "pricing") => Promise<void>;
  keepAlive?: () => Promise<void>;
}): Promise<Job> {
  const dir = await mkdtemp(join(tmpdir(), "scope-walk-"));
  try {
    await input.onStage?.("extracting");
    const filePath = join(dir, "walk.mp4");
    await writeFile(filePath, input.bytes);
    const meta = await probeMetadata(filePath, input.runner);
    const extracted = await extractFrames({ filePath, outDir: join(dir, "frames"), durationSeconds: meta.durationSeconds ?? 1, runner: input.runner });
    const loaded = await Promise.all(extracted.map(async (frame) => ({
      atSeconds: frame.timestampSeconds,
      jpeg: await readFile(frame.localPath),
      sequence: frame.sequenceNumber,
      localPath: frame.localPath,
    })));
    const diverse = prepareFrames(loaded, { durationSeconds: meta.durationSeconds ?? undefined });
    if (input.keepAlive) await input.keepAlive();
    const speech = await transcribeWithOpenAI(
      { filename: input.filename, bytes: new Uint8Array(input.bytes), mimeType: input.mimeType },
      { env: input.env, fetchImpl: input.fetchImpl, jobId: input.job.id, attribution: input.attribution },
    );
    const transcripts = speech.text ? segmentsFromTranscript(input.mediaId, speech.text) : input.job.transcripts;
    const heard = transcripts.length ? transcripts : input.job.transcripts;
    const detections: RawDetection[] = [];
    const stages = [];
    await input.onStage?.("inventorying");
    for (const frame of diverse) {
      if (input.keepAlive) await input.keepAlive();
      const source = loaded.find((item) => item.atSeconds === frame.atSeconds);
      if (!source) continue;
      const crops = [];
      const runner = input.runner ?? defaultRunner;
      if (meta.width && meta.height) {
        for (const tile of planTiles()) {
          const out = join(dir, `crop-${source.sequence}-${tile.row}-${tile.col}.jpg`);
          const filter = cropFilter(tileBox(tile), meta.width, meta.height);
          const result = await runner("ffmpeg", ["-y", "-i", source.localPath, "-vf", filter, out]);
          if (result.code === 0) {
            crops.push({ tile, bytes: new Uint8Array(await readFile(out)), mimeType: "image/jpeg" });
          }
        }
      }
      const inventory = await inventoryFrame({
        frameId: `frm_${source.sequence}`,
        mediaId: input.mediaId,
        timeMs: Math.round(frame.atSeconds * 1000),
        roomHint: roomAt(heard, Math.round(frame.atSeconds * 1000)),
        full: { bytes: new Uint8Array(frame.jpeg), mimeType: "image/jpeg" },
        crops,
        env: input.env,
        fetchImpl: input.fetchImpl,
        jobId: input.job.id,
        attribution: input.attribution,
      });
      detections.push(...inventory.detections);
      stages.push(inventory.stage);
    }
    const log = costLog({
      mediaId: input.mediaId,
      durationSeconds: meta.durationSeconds,
      stages,
      note: speech.status === "missing_key"
        ? "OPENAI_API_KEY is not set. Objects and narration were not invented. Transcription cost is a planning rate for the duration only."
        : "Token cost uses the usage the provider returned and published list rates. It is not an invoice.",
    });
    await input.onStage?.("assessing");
    await input.onStage?.("pricing");
    return runPipeline(input.job, {
      media: input.job.media,
      transcripts: transcripts.length ? transcripts : input.job.transcripts,
      frames: input.job.frames,
      usePriceBook: true,
      detections,
      analysisCost: log,
    });
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
}

function segmentsFromTranscript(mediaId: string, text: string): TranscriptSegment[] {
  const verbatim = parseVerbatimTranscript(text).flatMap((segment) => {
    if (segment.tSec != null) return [segment];
    const parts = segment.text.split(/\n+|(?<=[.!?])\s+/).map((part) => part.trim()).filter(Boolean);
    return (parts.length ? parts : [segment.text]).map((part) => ({ ...segment, text: part }));
  });
  if (!verbatim.length) return [];
  return verbatim.map((segment, index) => {
    const tSec = segment.tSec ?? index;
    const next = verbatim[index + 1]?.tSec;
    const endSec = next != null && next > tSec ? next : tSec + 4;
    return {
      id: createId("seg"),
      mediaId,
      startMs: Math.round(tSec * 1000),
      endMs: Math.round(endSec * 1000),
      text: segment.text,
      speaker: "narrator" as const,
      injectionFlags: [],
      source: "asr" as const,
    };
  });
}
