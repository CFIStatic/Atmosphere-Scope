import { describe, expect, it } from "vitest";
import { absoluteUrl, authCallbackDestination, publicOrigin, siteOrigin } from "./http";

const railway = "https://atmosphere-scope-production.up.railway.app";

describe("public origin", () => {
  it("prefers SITE_URL over the internal Railway bind address", () => {
    expect(publicOrigin({
      siteUrl: `${railway}/`,
      forwardedProto: "https",
      forwardedHost: "atmosphere-scope-production.up.railway.app",
      requestUrl: "http://0.0.0.0:8080/auth/callback?token_hash=x&type=signup",
    })).toBe(railway);
    expect(absoluteUrl(railway, "/login?error=confirm")).toBe(`${railway}/login?error=confirm`);
  });

  it("uses the forwarded host when SITE_URL is unset", () => {
    expect(publicOrigin({
      siteUrl: "  ",
      forwardedProto: "https,http",
      forwardedHost: "atmosphere-scope-production.up.railway.app, internal",
      requestUrl: "http://0.0.0.0:8080/auth/callback",
    })).toBe(railway);
  });

  it("falls back to the request origin", () => {
    expect(publicOrigin({
      requestUrl: "http://localhost:3000/login",
    })).toBe("http://localhost:3000");
    const request = new Request("http://0.0.0.0:8080/auth/callback?type=signup", {
      headers: { "x-forwarded-proto": "https", "x-forwarded-host": "atmosphere-scope-production.up.railway.app" },
    });
    expect(siteOrigin(request, { SITE_URL: "" })).toBe(railway);
    expect(siteOrigin(request, { SITE_URL: railway })).toBe(railway);
  });

  it("sends a bad signup confirmation to login and a good one to onboarding", () => {
    expect(authCallbackDestination({ ok: false, type: "signup", next: "/account" })).toBe("/login?error=confirm");
    expect(authCallbackDestination({ ok: true, type: "signup", next: "/account" })).toBe("/onboarding");
    expect(authCallbackDestination({ ok: true, type: "invite", next: "/auth/reset" })).toBe("/onboarding");
    expect(authCallbackDestination({ ok: true, type: "recovery", next: "/account" })).toBe("/auth/reset");
    expect(authCallbackDestination({ ok: false, type: "recovery", next: "/auth/reset" })).toBe("/auth/reset?error=invalid");
    expect(authCallbackDestination({ ok: true, type: "magiclink", next: "/record" })).toBe("/record");
    expect(authCallbackDestination({ ok: true, type: null, next: "https://evil.example" })).toBe("/");
  });
});
