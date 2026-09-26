import { NextResponse } from "next/server";
import { getActor } from "@/auth/request-session";
import { usageSince } from "@/storage/workspace-book";

export async function GET(request: Request) {
  const { actor } = await getActor();
  if (!actor) return NextResponse.json({ error: "Sign in required." }, { status: 401 });
  const range = new URL(request.url).searchParams.get("range") === "90d" ? 90 : 30;
  const since = new Date(Date.now() - range * 24 * 60 * 60 * 1000).toISOString();
  const rows = await usageSince(actor.userId, since);
  const inputTokens = rows.reduce((sum, row) => sum + (row.inputTokens ?? 0), 0);
  const outputTokens = rows.reduce((sum, row) => sum + (row.outputTokens ?? 0), 0);
  const priced = rows.filter((row) => row.costUsd != null);
  const costUsd = priced.length ? priced.reduce((sum, row) => sum + (row.costUsd ?? 0), 0) : null;
  const byDay = new Map<string, { day: string; tokens: number; costUsd: number | null }>();
  for (const row of rows) {
    const day = row.createdAt.slice(0, 10);
    const current = byDay.get(day) ?? { day, tokens: 0, costUsd: null as number | null };
    current.tokens += (row.inputTokens ?? 0) + (row.outputTokens ?? 0);
    if (row.costUsd != null) current.costUsd = (current.costUsd ?? 0) + row.costUsd;
    byDay.set(day, current);
  }
  return NextResponse.json({
    range,
    inputTokens,
    outputTokens,
    costUsd,
    days: [...byDay.values()],
    rows: rows.slice(-40).reverse(),
  });
}
