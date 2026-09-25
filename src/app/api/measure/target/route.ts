import { spawn } from "child_process";
import { NextResponse } from "next/server";

export const runtime = "nodejs";

function runPython(script: string, input: Buffer, args: string[] = []): Promise<{ code: number; stdout: string; stderr: string }> {
  return new Promise((resolve, reject) => {
    const child = spawn("python3", ["-m", script, ...args], { cwd: process.cwd() });
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
    child.stdin.write(input);
    child.stdin.end();
  });
}

export async function POST(request: Request) {
  const bytes = Buffer.from(await request.arrayBuffer());
  if (bytes.length < 32) return NextResponse.json({ error: "Empty frame." }, { status: 400 });
  const result = await runPython("measure.detect_sheet", bytes);
  if (result.code !== 0) return NextResponse.json({ error: "Sheet check failed.", detail: result.stderr.slice(-400) }, { status: 500 });
  try {
    return NextResponse.json(JSON.parse(result.stdout));
  } catch {
    return NextResponse.json({ error: "Sheet check returned an unreadable result." }, { status: 500 });
  }
}
