import { NextResponse } from "next/server";
import type { CatalogItem } from "@/domain/catalog";
import { currentCatalog, publishCatalog, readEstimateStore } from "@/storage/catalog-store";

export async function GET() {
  const stored = await readEstimateStore();
  return NextResponse.json({ current: stored.catalogs.at(-1), versions: stored.catalogs.map((item) => ({ id: item.id, version: item.version, publishedAt: item.publishedAt })) });
}

export async function PUT(request: Request) {
  const body = (await request.json()) as { items?: CatalogItem[] };
  if (!body.items?.length) return NextResponse.json({ error: "A catalog version needs at least one line." }, { status: 400 });
  const next = await publishCatalog(body.items, new Date().toISOString());
  const current = await currentCatalog();
  return NextResponse.json({ current, published: next });
}
