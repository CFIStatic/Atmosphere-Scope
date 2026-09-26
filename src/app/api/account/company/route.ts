import { NextResponse } from "next/server";
import { getActor } from "@/auth/request-session";
import { saveOrg } from "@/storage/workspace-book";

export async function POST(request: Request) {
  const { actor } = await getActor();
  if (!actor) return NextResponse.json({ error: "Sign in required." }, { status: 401 });
  const body = (await request.json()) as { name?: string; address?: string; licenseNumbers?: string; logoUrl?: string };
  const logoUrl = body.logoUrl ?? "";
  if (logoUrl.startsWith("data:") && (!logoUrl.startsWith("data:image/") || logoUrl.length > 180_000)) {
    return NextResponse.json({ error: "Use an image under 120 KB." }, { status: 400 });
  }
  try {
    const org = await saveOrg(actor.userId, actor.email, actor.role, {
      name: body.name ?? "",
      address: body.address ?? "",
      licenseNumbers: body.licenseNumbers ?? "",
      logoUrl,
    });
    return NextResponse.json({ org });
  } catch (error) {
    const message = error instanceof Error ? error.message : "The company was not saved.";
    return NextResponse.json({ error: message }, { status: 400 });
  }
}
