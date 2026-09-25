import { NextResponse } from "next/server";
import { getRequestSession } from "@/auth/request-session";
import type { RateBook } from "@/domain/estimate-engine";
import { currentRates, saveRates } from "@/storage/catalog-store";

export async function GET() {
  return NextResponse.json(await currentRates());
}

export async function PUT(request: Request) {
  const { session } = await getRequestSession();
  if (!session) return NextResponse.json({ error: "Sign in before changing the catalog or rate book." }, { status: 401 });
  if (session.role !== "estimator") return NextResponse.json({ error: "Sign in as an estimator. A customer sign-in cannot publish the catalog or rate book." }, { status: 403 });
  const body = (await request.json()) as Partial<RateBook>;
  const invalid = invalidPricedRow(body.labor, "hourlyUsd") ?? invalidPricedRow(body.equipment, "rateUsd");
  if (invalid) return NextResponse.json({ error: invalid }, { status: 400 });
  const current = await currentRates();
  const next = await saveRates({
    region: body.region?.trim() || current.region,
    overheadPercent: numberOr(body.overheadPercent, current.overheadPercent),
    profitPercent: numberOr(body.profitPercent, current.profitPercent),
    taxPercent: numberOr(body.taxPercent, current.taxPercent),
    taxBase: body.taxBase === "materials" ? "materials" : "none",
    labor: body.labor ?? current.labor,
    equipment: body.equipment ?? current.equipment,
    editedAt: new Date().toISOString(),
  });
  return NextResponse.json(next);
}

function numberOr(value: number | undefined, fallback: number): number {
  return typeof value === "number" && Number.isFinite(value) && value >= 0 ? value : fallback;
}

function invalidPricedRow(rows: { source?: string; asOf?: string | null; hourlyUsd?: number | null; rateUsd?: number | null; trade?: string; equipment?: string }[] | undefined, amountKey: "hourlyUsd" | "rateUsd"): string | null {
  for (const row of rows ?? []) {
    const amount = row[amountKey];
    if (amount == null) continue;
    const label = row.trade ? `${row.trade} labor` : row.equipment || "This rate";
    if (!row.source?.trim() || row.source.trim() === "No rate entered" || !row.asOf) return `${label} needs a source and a date before it can be saved.`;
  }
  return null;
}
