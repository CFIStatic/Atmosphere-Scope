import { cookies } from "next/headers";
import { NextResponse } from "next/server";
import { parseSessionCookie } from "@/auth/access";
import { approveRecord, authorizeRecord } from "@/domain/records";
import { getWalkthrough, putWalkthrough } from "@/storage/walkthrough-store";

const COOKIE = "scope_session";

export async function POST(request: Request, context: { params: Promise<{ id: string }> }) {
  const session = parseSessionCookie((await cookies()).get(COOKIE)?.value);
  if (!session) return NextResponse.json({ error: "Sign in first." }, { status: 401 });
  const { id } = await context.params;
  const current = await getWalkthrough(id);
  if (!current) return NextResponse.json({ error: "No saved walkthrough with that id." }, { status: 404 });
  const body = (await request.json()) as { type?: string; statement?: string };
  const at = new Date().toISOString();
  try {
    if (body.type === "approve") {
      if (session.role !== "estimator") return NextResponse.json({ error: "Sign in as an estimator. Approval is separate from customer authorization." }, { status: 403 });
      return NextResponse.json({ record: await putWalkthrough(approveRecord(current, session.name, at)) });
    }
    if (body.type === "authorize") {
      if (session.role !== "customer") return NextResponse.json({ error: "Sign in as the customer. Authorization does not approve the estimate." }, { status: 403 });
      return NextResponse.json({ record: await putWalkthrough(authorizeRecord(current, session.name, body.statement ?? "", at)) });
    }
    return NextResponse.json({ error: "Unknown action." }, { status: 400 });
  } catch (error) {
    const message = error instanceof Error ? error.message : "The version was not changed.";
    return NextResponse.json({ error: message }, { status: 409 });
  }
}
