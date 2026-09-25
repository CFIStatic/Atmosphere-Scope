import { NextResponse } from "next/server";
import { getWalkthrough } from "@/storage/walkthrough-store";

export async function GET(_request: Request, context: { params: Promise<{ id: string }> }) {
  const { id } = await context.params;
  const record = await getWalkthrough(id);
  if (!record) return NextResponse.json({ error: "No saved walkthrough with that id." }, { status: 404 });
  return NextResponse.json({ record });
}
