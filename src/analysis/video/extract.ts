/**
 * FFmpeg metadata and frame extraction.
 * Adapted from Atmosphere `backend/src/verification/frames/extract.ts` (commit a9e2680).
 * Runners are injectable so tests never need the binary. Scope does not upload
 * into Atmosphere's verification_frames table; the caller stores bytes.
 */

import { spawn } from "node:child_process";
import { mkdir, readFile } from "node:fs/promises";
import { join } from "node:path";

export type VideoMetadata = {
  durationSeconds: number | null;
  width: number | null;
  height: number | null;
  codec: string | null;
  fps: number | null;
  rotate: number | null;
};

export type ExtractedFrame = {
  timestampSeconds: number;
  sequenceNumber: number;
  localPath: string;
  width: number | null;
  height: number | null;
};

export type CommandRunner = (bin: string, args: string[]) => Promise<{ stdout: string; stderr: string; code: number }>;

export const defaultRunner: CommandRunner = (bin, args) => new Promise((resolve, reject) => {
  const child = spawn(bin, args, { stdio: ["ignore", "pipe", "pipe"] });
  let stdout = "";
  let stderr = "";
  child.stdout.on("data", (chunk) => { stdout += String(chunk); });
  child.stderr.on("data", (chunk) => { stderr += String(chunk); });
  child.on("error", reject);
  child.on("close", (code) => resolve({ stdout, stderr, code: code ?? 1 }));
});

export async function probeMetadata(filePath: string, runner: CommandRunner = defaultRunner, ffprobe = "ffprobe"): Promise<VideoMetadata> {
  const { stdout, code, stderr } = await runner(ffprobe, ["-v", "quiet", "-print_format", "json", "-show_format", "-show_streams", filePath]);
  if (code !== 0) throw new Error(`ffprobe failed: ${stderr.slice(0, 500)}`);
  const parsed = JSON.parse(stdout) as {
    format?: { duration?: string };
    streams?: Array<{ codec_type?: string; codec_name?: string; width?: number; height?: number; avg_frame_rate?: string; tags?: { rotate?: string } }>;
  };
  const video = parsed.streams?.find((stream) => stream.codec_type === "video");
  let fps: number | null = null;
  if (video?.avg_frame_rate?.includes("/")) {
    const [a, b] = video.avg_frame_rate.split("/").map(Number);
    if (b) fps = a / b;
  }
  return {
    durationSeconds: parsed.format?.duration ? Number(parsed.format.duration) : null,
    width: video?.width ?? null,
    height: video?.height ?? null,
    codec: video?.codec_name ?? null,
    fps,
    rotate: video?.tags?.rotate ? Number(video.tags.rotate) : null,
  };
}

/** Interval sample. maxFrames is a safety ceiling for a pathological file, not an object cap. */
export async function extractFrames(opts: {
  filePath: string;
  outDir: string;
  durationSeconds: number;
  intervalSeconds?: number;
  maxFrames?: number;
  runner?: CommandRunner;
  ffmpeg?: string;
}): Promise<ExtractedFrame[]> {
  const runner = opts.runner ?? defaultRunner;
  const interval = opts.intervalSeconds ?? 1;
  const maxFrames = opts.maxFrames ?? 120;
  await mkdir(opts.outDir, { recursive: true });
  const fps = Math.max(1 / interval, 1 / 60);
  const pattern = join(opts.outDir, "frame_%05d.jpg");
  const { code, stderr } = await runner(opts.ffmpeg ?? "ffmpeg", ["-y", "-i", opts.filePath, "-vf", `fps=${fps}`, "-q:v", "3", "-frames:v", String(maxFrames), pattern]);
  if (code !== 0) throw new Error(`ffmpeg extract failed: ${stderr.slice(0, 500)}`);
  const frames: ExtractedFrame[] = [];
  for (let i = 1; i <= maxFrames; i += 1) {
    const localPath = join(opts.outDir, `frame_${String(i).padStart(5, "0")}.jpg`);
    try {
      await readFile(localPath);
    } catch {
      break;
    }
    const timestampSeconds = Math.min((i - 1) * interval, Math.max(opts.durationSeconds - 0.1, 0));
    frames.push({ timestampSeconds: Number(timestampSeconds.toFixed(3)), sequenceNumber: i - 1, localPath, width: null, height: null });
  }
  return frames;
}

export async function extractThumbnail(opts: { filePath: string; outPath: string; atSeconds?: number; width?: number; runner?: CommandRunner; ffmpeg?: string }): Promise<void> {
  const runner = opts.runner ?? defaultRunner;
  const { code, stderr } = await runner(opts.ffmpeg ?? "ffmpeg", ["-y", "-ss", String(opts.atSeconds ?? 1), "-i", opts.filePath, "-frames:v", "1", "-vf", `scale=${opts.width ?? 640}:-1`, opts.outPath]);
  if (code !== 0) throw new Error(`ffmpeg thumbnail failed: ${stderr.slice(0, 500)}`);
}
