import { createHmac, randomBytes, timingSafeEqual } from "node:crypto";
import type { Env } from "@/analysis/config";
import { authMode, sessionFromSupabaseUser, type StoredSession } from "@/auth/access";
import { isAccountRole } from "@/auth/gate";

let ephemeralSecret: string | null = null;

function sessionSecret(env: Env): string {
  const configured = env.SESSION_SECRET?.trim()
    || env.SUPABASE_SERVICE_ROLE_KEY?.trim()
    || env.SUPABASE_SECRET_KEY?.trim()
    || env.SUPABASE_ANON_KEY?.trim();
  if (configured) return configured;
  if (!ephemeralSecret) ephemeralSecret = randomBytes(32).toString("base64url");
  return ephemeralSecret;
}

export function serializeSessionCookie(session: StoredSession, env: Env = process.env): string {
  const payload = Buffer.from(JSON.stringify(publicFields(session)), "utf8").toString("base64url");
  const signature = createHmac("sha256", sessionSecret(env)).update(payload).digest("base64url");
  return `${payload}.${signature}`;
}

function publicFields(session: StoredSession): StoredSession {
  return { email: session.email, name: session.name, role: session.role, accessToken: session.accessToken };
}

function readSignedSession(raw: string, env: Env): StoredSession | null {
  const split = raw.lastIndexOf(".");
  if (split <= 0) return null;
  const payload = raw.slice(0, split);
  const signature = raw.slice(split + 1);
  const expected = createHmac("sha256", sessionSecret(env)).update(payload).digest("base64url");
  const actualBytes = Buffer.from(signature);
  const expectedBytes = Buffer.from(expected);
  if (actualBytes.length !== expectedBytes.length || !timingSafeEqual(actualBytes, expectedBytes)) return null;
  try {
    const parsed = JSON.parse(Buffer.from(payload, "base64url").toString("utf8")) as StoredSession;
    if (!parsed.email || !parsed.name) return null;
    if (!isAccountRole(parsed.role) || parsed.role === "admin") return null;
    return parsed;
  } catch {
    return null;
  }
}

export async function parseSessionCookie(raw: string | undefined, env: Env = process.env, fetchImpl: typeof fetch = fetch): Promise<StoredSession | null> {
  if (!raw) return null;
  const parsed = readSignedSession(raw, env);
  if (!parsed) return null;
  if (authMode(env) !== "supabase") return parsed;
  if (!parsed.accessToken) return null;
  try {
    return await sessionFromAccessToken(parsed.accessToken, env, fetchImpl);
  } catch {
    return null;
  }
}

async function sessionFromAccessToken(accessToken: string, env: Env, fetchImpl: typeof fetch): Promise<StoredSession> {
  const url = env.SUPABASE_URL?.trim().replace(/\/$/, "") ?? "";
  const anon = env.SUPABASE_ANON_KEY?.trim() ?? "";
  if (!url || !anon) throw new Error("Supabase auth needs SUPABASE_URL and SUPABASE_ANON_KEY on the server.");
  const response = await fetchImpl(`${url}/auth/v1/user`, {
    headers: { apikey: anon, Authorization: `Bearer ${accessToken}` },
  });
  if (!response.ok) throw new Error("Supabase did not accept this session.");
  const user = (await response.json()) as { email?: string; app_metadata?: object; user_metadata?: object };
  return sessionFromSupabaseUser(user, accessToken);
}
