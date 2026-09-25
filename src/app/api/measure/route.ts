import { spawn } from "child_process";
import { mkdtemp, rm, writeFile } from "fs/promises";
import os from "os";
import path from "path";
import { NextResponse } from "next/server";

export const runtime = "nodejs";

export async function POST(request: Request) {
  const form = await request.formData();
  const video = form.get("video");
  if (!(video instanceof File)) return NextResponse.json({ error: "Attach a walkthrough video." }, { status: 400 });
  const directory = await mkdtemp(path.join(os.tmpdir(), "scope-video-"));
  const filePath = path.join(directory, "walkthrough.mp4");
  try {
    await writeFile(filePath, Buffer.from(await video.arrayBuffer()));
    const result = await new Promise<{ code: number; stdout: string; stderr: string }>((resolve, reject) => {
      const child = spawn("python3", ["-m", "measure.from_video", filePath], { cwd: process.cwd() });
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
    if (result.code !== 0) {
      return NextResponse.json({ error: "Measurement failed.", detail: (result.stderr || result.stdout).slice(-600) }, { status: 500 });
    }
    return NextResponse.json(JSON.parse(result.stdout));
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
}
