import { describe, expect, it } from "vitest";
import { actionAllowed, editBlocked, localSession, publicSession, sessionFromSupabaseUser, signInWithSupabase } from "./access";

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
});
