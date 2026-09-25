import { spawn } from "node:child_process";
import { mkdtemp, mkdir, readdir, readFile, rm } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { gpuAdapterReport } from "@/analysis/adapters/gpu";
import { selectPricingProvider } from "@/analysis/config";
import { enrichMeasuredWalkthrough } from "@/analysis/walkthrough";

const VISION_FRAMES = 4;

export async function measureVideoFile(filePath: string, file: { name: string; type: string }): Promise<{ ok: true; body: unknown } | { ok: false; status: number; body: unknown }> {
  const framesDir = path.join(path.dirname(filePath), "frames");
  await mkdir(framesDir, { recursive: true });
  const result = await runSolver(filePath, framesDir);
  if (result.code !== 0) {
    return { ok: false, status: 500, body: { error: "Measurement failed.", detail: (result.stderr || result.stdout).slice(-600) } };
  }
  try {
    const measurement = JSON.parse(result.stdout) as Record<string, unknown>;
    const ai = await safeEnrich(filePath, framesDir, file);
    return { ok: true, body: { ...measurement, ai } };
  } catch {
    return { ok: false, status: 500, body: { error: "Measurement output could not be read." } };
  }
}

export async function measureVideoBytes(bytes: Uint8Array, file: { name: string; type: string }) {
  const directory = await mkdtemp(path.join(os.tmpdir(), "scope-video-"));
  const filePath = path.join(directory, "walkthrough.mp4");
  try {
    const { writeFile } = await import("node:fs/promises");
    await writeFile(filePath, bytes);
    return await measureVideoFile(filePath, file);
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
}

async function safeEnrich(filePath: string, framesDir: string, file: { name: string; type: string }) {
  try {
    const names = (await readdir(framesDir)).filter((name) => /\.jpe?g$/i.test(name)).sort();
    const chosen = pickEvenly(names, VISION_FRAMES);
    const frames = await Promise.all(chosen.map(async (name) => ({
      name,
      bytes: new Uint8Array(await readFile(path.join(framesDir, name))),
      mimeType: "image/jpeg",
    })));
    const video = new Uint8Array(await readFile(filePath));
    return await enrichMeasuredWalkthrough({
      video: { filename: file.name || "walkthrough.mp4", bytes: video, mimeType: file.type || "video/mp4" },
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
