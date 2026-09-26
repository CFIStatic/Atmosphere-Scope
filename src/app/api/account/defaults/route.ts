import { NextResponse } from "next/server";
import { getActor } from "@/auth/request-session";
import { cleanDefaults, type EstimateDefaults } from "@/domain/workspace";
import { saveDefaults } from "@/storage/workspace-book";

export async function PUT(request: Request) {
  const { actor } = await getActor();
  if (!actor) return NextResponse.json({ error: "Sign in required." }, { status: 401 });
  if (actor.role === "customer") return NextResponse.json({ error: "Estimate defaults stay with the estimator." }, { status: 403 });
  try {
    const body = (await request.json()) as Partial<EstimateDefaults>;
    const defaults = await saveDefaults(actor.userId, cleanDefaults("", body));
    return NextResponse.json({ defaults });
  } catch (error) {
    const message = error instanceof Error ? error.message : "The defaults were not saved.";
    return NextResponse.json({ error: message }, { status: 400 });
  }
}
