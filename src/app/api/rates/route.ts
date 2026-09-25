import { NextResponse } from "next/server";
import type { RateBook } from "@/domain/estimate-engine";
import { currentRates, saveRates } from "@/storage/catalog-store";

export async function GET() {
  return NextResponse.json(await currentRates());
}

export async function PUT(request: Request) {
  const body = (await request.json()) as Partial<RateBook>;
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
