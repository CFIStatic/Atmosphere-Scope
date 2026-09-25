import { cookies } from "next/headers";
import { authMode, parseSessionCookie, publicSession, sessionFromSupabaseUser } from "@/auth/access";
import { createSupabaseServer } from "@/auth/supabase-server";
import type { PublicSession } from "@/auth/access";

const COOKIE = "scope_session";

export async function getRequestSession(): Promise<{ mode: "local" | "supabase"; session: PublicSession | null }> {
  const mode = authMode();
  if (mode === "local") {
    const jar = await cookies();
    const stored = await parseSessionCookie(jar.get(COOKIE)?.value);
    return { mode, session: stored ? publicSession(stored) : null };
  }
  const supabase = await createSupabaseServer();
  if (!supabase) return { mode, session: null };
  const { data } = await supabase.auth.getUser();
  const user = data.user;
  if (!user) return { mode, session: null };
  try {
    return { mode, session: publicSession(sessionFromSupabaseUser(user, "cookie")) };
  } catch {
    return { mode, session: null };
  }
}
