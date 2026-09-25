import { cookies } from "next/headers";
import { NextResponse } from "next/server";
import { parseSessionCookie } from "@/auth/access";
import type { CatalogItem } from "@/domain/catalog";
import { currentCatalog, publishCatalog, readEstimateStore } from "@/storage/catalog-store";

export async function GET() {
  const stored = await readEstimateStore();
  return NextResponse.json({ current: stored.catalogs.at(-1), versions: stored.catalogs.map((item) => ({ id: item.id, version: item.version, publishedAt: item.publishedAt })) });
}

export async function PUT(request: Request) {
  const session = await parseSessionCookie((await cookies()).get("scope_session")?.value);
  if (!session) return NextResponse.json({ error: "Sign in before changing the catalog or rate book." }, { status: 401 });
  if (session.role !== "estimator") return NextResponse.json({ error: "Sign in as an estimator. A customer sign-in cannot publish the catalog or rate book." }, { status: 403 });
  const body = (await request.json()) as { items?: CatalogItem[] };
  if (!body.items?.length) return NextResponse.json({ error: "A catalog version needs at least one line." }, { status: 400 });
  const next = await publishCatalog(body.items, new Date().toISOString());
  const current = await currentCatalog();
  return NextResponse.json({ current, published: next });
}
