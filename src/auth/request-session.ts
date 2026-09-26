import { cookies } from "next/headers";
import { authMode, publicSession, sessionFromSupabaseUser, type PublicSession } from "@/auth/access";
import { parseSessionCookie } from "@/auth/signed-cookie";
import { createSupabaseServer } from "@/auth/supabase-server";

export type Actor = PublicSession & { userId: string };

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

export async function getActor(): Promise<{ mode: "local" | "supabase"; actor: Actor | null }> {
  const mode = authMode();
  if (mode === "local") {
    const { session } = await getRequestSession();
    if (!session) return { mode, actor: null };
    return { mode, actor: { ...session, userId: session.email.trim().toLowerCase() } };
  }
  const supabase = await createSupabaseServer();
  if (!supabase) return { mode, actor: null };
  const { data } = await supabase.auth.getUser();
  const user = data.user;
  if (!user?.email) return { mode, actor: null };
  try {
    const session = publicSession(sessionFromSupabaseUser(user, "cookie"));
    return { mode, actor: { ...session, userId: user.id } };
  } catch {
    return { mode, actor: null };
  }
}
