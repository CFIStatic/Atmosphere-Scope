import { NextResponse } from "next/server";
import { getActor } from "@/auth/request-session";

export async function GET() {
  const { actor } = await getActor();
  if (!actor) return NextResponse.json({ error: "Sign in required." }, { status: 401 });
  return NextResponse.json({
    plan: null,
    status: "none",
    invoices: [],
    note: "No plan is attached. Billing is not connected.",
  });
}
