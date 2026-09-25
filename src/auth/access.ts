import { createHmac, randomBytes, timingSafeEqual } from "node:crypto";
import type { EstimateStatus } from "@/domain/types";
import type { Env } from "@/analysis/config";
import { authModeFromStorage, isAccountRole, roleFromAppMetadata, type AccountRole } from "@/auth/gate";

export type { AccountRole };

export type PublicSession = {
  email: string;
  name: string;
  role: AccountRole;
};

export type StoredSession = PublicSession & { accessToken?: string };

const LOCKED_EDITS = new Set(["sketch", "undo", "redo", "edit_scope", "apply_quantities", "set_affected", "add_named_room", "settings"]);

export function authMode(env: Env = process.env): "supabase" | "local" {
  return authModeFromStorage(env.STORAGE);
}

export function localSession(input: { name?: string; email?: string; role?: string }): StoredSession {
  const name = input.name?.trim() ?? "";
  const email = input.email?.trim() ?? "";
  if (!name || !email) throw new Error("Name and email are required.");
  if (input.role !== "estimator" && input.role !== "customer") throw new Error("Choose estimator or customer. A local sign-in is not a Supabase account.");
  return { name, email, role: input.role };
}

export function sessionFromSupabaseUser(
  user: { email?: string | null; app_metadata?: object; user_metadata?: object },
  accessToken: string,
): StoredSession {
  const email = user.email?.trim() ?? "";
  if (!email || !accessToken) throw new Error("Supabase did not return a session.");
  const role = roleFromAppMetadata(user.app_metadata);
  if (!role) throw new Error("This account has no role in app metadata.");
  const name = user.user_metadata && "name" in user.user_metadata ? String((user.user_metadata as { name?: unknown }).name ?? "") : "";
  return { email, name: name.trim() || email, role, accessToken };
}

export function publicSession(session: StoredSession): PublicSession {
  return { email: session.email, name: session.name, role: session.role };
}

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
  const payload = Buffer.from(JSON.stringify(session), "utf8").toString("base64url");
  const signature = createHmac("sha256", sessionSecret(env)).update(payload).digest("base64url");
  return `${payload}.${signature}`;
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
  const user = (await response.json()) as { email?: string; app_metadata?: { role?: string }; user_metadata?: { name?: string; role?: string } };
  return sessionFromSupabaseUser(user, accessToken);
}

export function actionAllowed(type: string, role: AccountRole | null): string | null {
  if (type === "mark_reviewed" || type === "approve") {
    if (role !== "estimator") return "Sign in as an estimator. Approval is separate from customer authorization.";
  }
  if (type === "authorize") {
    if (role !== "customer") return "Sign in as the customer. Authorization does not approve the estimate.";
  }
  return null;
}

export function editBlocked(type: string, status: EstimateStatus | null): string | null {
  if (!status || !LOCKED_EDITS.has(type)) return null;
  if (status === "estimator_approved" || status === "customer_authorized") return "This version is locked. It was not changed.";
  return null;
}

export async function signInWithSupabase(
  input: { email: string; password: string },
  env: Env,
  fetchImpl: typeof fetch,
): Promise<StoredSession> {
  const url = env.SUPABASE_URL?.trim().replace(/\/$/, "") ?? "";
  const anon = env.SUPABASE_ANON_KEY?.trim() ?? "";
  if (!url || !anon) throw new Error("Supabase auth needs SUPABASE_URL and SUPABASE_ANON_KEY on the server.");
  const response = await fetchImpl(`${url}/auth/v1/token?grant_type=password`, {
    method: "POST",
    headers: { apikey: anon, Authorization: `Bearer ${anon}`, "Content-Type": "application/json" },
    body: JSON.stringify({ email: input.email, password: input.password }),
  });
  if (!response.ok) throw new Error("Sign-in failed.");
  const body = (await response.json()) as {
    access_token?: string;
    user?: { email?: string; app_metadata?: { role?: string }; user_metadata?: { name?: string; role?: string } };
  };
  return sessionFromSupabaseUser(body.user ?? {}, body.access_token ?? "");
}
