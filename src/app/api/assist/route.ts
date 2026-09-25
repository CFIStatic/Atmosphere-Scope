import { NextResponse } from "next/server";
import { proposeCommand } from "@/analysis/openai/command";
import { transcribeWithOpenAI } from "@/analysis/openai/transcribe";
import { getRequestSession } from "@/auth/request-session";
import type { WalkthroughSnapshot } from "@/capture/snapshot";
import { confirmProposal, diffProposal, interpretUtterance, jobContext, parseProposal } from "@/domain/assist";

export const runtime = "nodejs";

export async function POST(request: Request) {
  const { session } = await getRequestSession();
  const admin = session?.role === "admin";
  const body = await request.json().catch(() => null);
  if (!body || typeof body !== "object") return NextResponse.json({ ready: false, notice: null }, { status: 400 });
  const record = body as { audioBase64?: string; mime?: string; prompt?: string; snapshot?: WalkthroughSnapshot; confirm?: boolean; proposal?: unknown };

  if (record.audioBase64) {
    const bytes = Buffer.from(record.audioBase64, "base64");
    const heard = await transcribeWithOpenAI({ filename: "note.webm", bytes, mimeType: record.mime || "audio/webm" });
    if (heard.status === "missing_key") return NextResponse.json({ ready: false, text: null, notice: admin ? "Ask Atmosphere is off." : null });
    return NextResponse.json({ ready: heard.status === "ok", text: heard.text, notice: null });
  }

  const snapshot = record.snapshot;
  if (!snapshot?.plan?.rooms) return NextResponse.json({ ready: false, notice: null }, { status: 400 });
  const prompt = typeof record.prompt === "string" ? record.prompt : "";

  if (record.confirm === true) {
    const proposal = parseProposal(record.proposal);
    if (!proposal) return NextResponse.json({ ready: true, notice: null, applied: false }, { status: 400 });
    const confirmed = confirmProposal(snapshot, proposal, { by: session?.name || "You", prompt, now: new Date().toISOString() });
    return NextResponse.json({ ready: true, applied: true, snapshot: confirmed.snapshot, diffs: confirmed.diffs });
  }

  const local = interpretUtterance(prompt, snapshot);
  const model = await proposeCommand(prompt, jobContext(snapshot));
  const proposal = model.proposal ?? (local.matched ? local.proposal : null);
  if (!proposal) return NextResponse.json({ ready: model.ready, proposal: null, diffs: [], notice: admin && !model.ready ? "Ask Atmosphere is off." : null });
  return NextResponse.json({ ready: model.ready, proposal, diffs: diffProposal(snapshot, proposal), notice: null });
}
