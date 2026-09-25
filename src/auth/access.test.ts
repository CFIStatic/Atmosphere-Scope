import { describe, expect, it } from "vitest";
import { actionAllowed, editBlocked, localSession, parseSessionCookie, publicSession, serializeSessionCookie, sessionFromSupabaseUser, signInWithSupabase } from "./access";

describe("accounts", () => {
  it("keeps estimator approval and customer authorization on different roles", () => {
    expect(actionAllowed("approve", "customer")).toMatch(/estimator/);
    expect(actionAllowed("authorize", "estimator")).toMatch(/customer/);
    expect(actionAllowed("approve", "estimator")).toBeNull();
    expect(actionAllowed("authorize", "customer")).toBeNull();
    expect(actionAllowed("sketch", null)).toBeNull();
  });

  it("locks edits after approval and does not return the access token", () => {
    expect(editBlocked("sketch", "estimator_approved")).toMatch(/locked/);
    expect(editBlocked("edit_scope", "customer_authorized")).toMatch(/locked/);
    expect(editBlocked("approve", "estimator_approved")).toBeNull();
    expect(editBlocked("sketch", "ai_draft")).toBeNull();
    const stored = sessionFromSupabaseUser({ email: "a@example.com", app_metadata: { role: "estimator" }, user_metadata: { name: "Ada", role: "customer" } }, "secret-token");
    expect(stored.role).toBe("estimator");
    expect(() => sessionFromSupabaseUser({ email: "a@example.com", user_metadata: { role: "estimator" } }, "secret-token")).toThrow(/app metadata/);
    expect(publicSession(stored)).toEqual({ email: "a@example.com", name: "Ada", role: "estimator" });
    expect(JSON.stringify(publicSession(stored))).not.toContain("secret-token");
    expect(() => localSession({ name: "Ada", email: "a@example.com", role: "admin" })).toThrow(/estimator or customer/);
  });

  it("signs in through Supabase without keeping the password", async () => {
    let seen = "";
    const session = await signInWithSupabase({ email: "a@example.com", password: "pw" }, { SUPABASE_URL: "https://abc.supabase.co", SUPABASE_ANON_KEY: "anon" }, (async (input: RequestInfo | URL, init?: RequestInit) => {
      seen = String(init?.body);
      expect(String(input)).toBe("https://abc.supabase.co/auth/v1/token?grant_type=password");
      const headers = init?.headers as Record<string, string>;
      expect(headers.apikey).toBe("anon");
      return Response.json({ access_token: "tok", user: { email: "a@example.com", app_metadata: { role: "customer" }, user_metadata: { name: "Pat", role: "estimator" } } });
    }) as typeof fetch);
    expect(session.role).toBe("customer");
    expect(seen).toContain("pw");
    expect(JSON.stringify(publicSession(session))).not.toContain("pw");
    expect(JSON.stringify(publicSession(session))).not.toContain("tok");
  });

  it("rejects an unsigned cookie and reads the Supabase role from the access token", async () => {
    const env = { SUPABASE_URL: "https://abc.supabase.co", SUPABASE_ANON_KEY: "anon", SESSION_SECRET: "test-secret" };
    expect(await parseSessionCookie(JSON.stringify({ email: "a@example.com", name: "Ada", role: "estimator", accessToken: "tok" }), env, fetch)).toBeNull();
    const stored = sessionFromSupabaseUser({ email: "a@example.com", app_metadata: { role: "customer" }, user_metadata: { name: "Ada", role: "estimator" } }, "tok");
    const raw = serializeSessionCookie({ ...stored, role: "estimator" }, env);
    let authorization = "";
    const session = await parseSessionCookie(raw, env, (async (_input: RequestInfo | URL, init?: RequestInit) => {
      authorization = String((init?.headers as Record<string, string> | undefined)?.Authorization ?? "");
      return Response.json({ email: "a@example.com", app_metadata: { role: "customer" }, user_metadata: { name: "Ada", role: "estimator" } });
    }) as typeof fetch);
    expect(authorization).toBe("Bearer tok");
    expect(session?.role).toBe("customer");
    expect(await parseSessionCookie(raw, env, (async () => new Response("no", { status: 401 })) as typeof fetch)).toBeNull();
    const localEnv = { SESSION_SECRET: "local-secret" };
    const local = serializeSessionCookie({ email: "a@example.com", name: "Ada", role: "customer" }, localEnv);
    expect((await parseSessionCookie(local, localEnv, fetch))?.role).toBe("customer");
    const flipped = `${local.slice(0, -1)}${local.endsWith("a") ? "b" : "a"}`;
    expect(await parseSessionCookie(flipped, localEnv, fetch)).toBeNull();
  });
});
