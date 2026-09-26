import { NextResponse } from "next/server";
import { authMode } from "@/auth/access";

export async function GET() {
  return NextResponse.json({ ok: true, storage: authMode() });
}
