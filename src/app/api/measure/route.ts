import { spawn } from "child_process";
import { mkdir, mkdtemp, readdir, readFile, rm, writeFile } from "fs/promises";
import os from "os";
import path from "path";
import { NextResponse } from "next/server";
import { gpuAdapterReport } from "@/analysis/adapters/gpu";
import { selectPricingProvider } from "@/analysis/config";
import { enrichMeasuredWalkthrough } from "@/analysis/walkthrough";

export const runtime = "nodejs";
export const maxDuration = 120;

const VISION_FRAMES = 4;

export async function POST(request: Request) {
  const form = await request.formData();
  const video = form.get("video");
  if (!(video instanceof File)) return NextResponse.json({ error: "Attach a walkthrough video." }, { status: 400 });
  const directory = await mkdtemp(path.join(os.tmpdir(), "scope-video-"));
  const filePath = path.join(directory, "walkthrough.mp4");
  const framesDir = path.join(directory, "frames");
  try {
    await mkdir(framesDir, { recursive: true });
    await writeFile(filePath, Buffer.from(await video.arrayBuffer()));
    const result = await runSolver(filePath, framesDir);
    if (result.code !== 0) {
      return NextResponse.json({ error: "Measurement failed.", detail: (result.stderr || result.stdout).slice(-600) }, { status: 500 });
    }
    const measurement = JSON.parse(result.stdout) as Record<string, unknown>;
    const ai = await safeEnrich(filePath, framesDir, video);
    return NextResponse.json({ ...measurement, ai });
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
}

async function safeEnrich(filePath: string, framesDir: string, video: File) {
  try {
    const names = (await readdir(framesDir)).filter((name) => /\.jpe?g$/i.test(name)).sort();
    const chosen = pickEvenly(names, VISION_FRAMES);
    const frames = await Promise.all(chosen.map(async (name) => ({
      name,
      bytes: new Uint8Array(await readFile(path.join(framesDir, name))),
      mimeType: "image/jpeg",
    })));
    const bytes = new Uint8Array(await readFile(filePath));
    return await enrichMeasuredWalkthrough({
      video: { filename: video.name || "walkthrough.mp4", bytes, mimeType: video.type || "video/mp4" },
      frames,
    });
  } catch {
    return {
      transcription: { status: "failed", text: null, note: "Transcription failed. Narration was not invented.", injectionFlags: [] },
      objects: [],
      objectNote: "Object identification failed. Objects were not invented.",
      offers: [],
      pricing: selectPricingProvider(),
      measurement: gpuAdapterReport(),
    };
  }
}

function pickEvenly(names: string[], max: number): string[] {
  if (names.length <= max) return names;
  const picked: string[] = [];
  for (let index = 0; index < max; index += 1) {
    picked.push(names[Math.round((index * (names.length - 1)) / (max - 1))]);
  }
  return [...new Set(picked)];
}

function runSolver(filePath: string, framesDir: string) {
  return new Promise<{ code: number; stdout: string; stderr: string }>((resolve, reject) => {
    const child = spawn("python3", ["-m", "measure.from_video", filePath, framesDir], { cwd: process.cwd() });
    let stdout = "";
    let stderr = "";
    child.stdout.on("data", (chunk) => {
      stdout += String(chunk);
    });
    child.stderr.on("data", (chunk) => {
      stderr += String(chunk);
    });
    child.on("error", reject);
    child.on("close", (code) => resolve({ code: code ?? 1, stdout, stderr }));
  });
}
