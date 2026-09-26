import { describe, expect, it } from "vitest";
import {
  authModeFromStorage,
  canMutateJobs,
  canSeeJob,
  decideRequest,
  devSignInAllowed,
  passwordHint,
  passwordProblem,
  roleFromAppMetadata,
  safeNext,
  SIGN_IN_ERROR,
} from "./gate";

const base = { mode: "supabase" as const, method: "GET", signedIn: false, role: null, configured: true };

describe("auth gate", () => {
  it("uses STORAGE=supabase as the only switch into hosted auth", () => {
    expect(authModeFromStorage("supabase")).toBe("supabase");
    expect(authModeFromStorage(" local ")).toBe("local");
    expect(authModeFromStorage(undefined)).toBe("local");
    expect(devSignInAllowed("local")).toBe(true);
    expect(devSignInAllowed("supabase")).toBe(false);
  });

  it("sends signed-out visitors to login and remembers the path", () => {
    expect(decideRequest({ ...base, pathname: "/measure" })).toEqual({
      type: "redirect",
      pathname: "/login",
      search: "?next=%2Fmeasure",
    });
    expect(decideRequest({ ...base, pathname: "/api/jobs" })).toEqual({ type: "unauthorized" });
    expect(decideRequest({ ...base, pathname: "/login" })).toEqual({ type: "allow" });
    expect(decideRequest({ ...base, pathname: "/signup" })).toEqual({ type: "allow" });
    expect(decideRequest({ ...base, pathname: "/onboarding" })).toEqual({ type: "allow" });
    expect(decideRequest({ ...base, pathname: "/api/health" })).toEqual({ type: "allow" });
    expect(decideRequest({ ...base, pathname: "/api/auth/signup", method: "POST" })).toEqual({ type: "allow" });
    expect(decideRequest({ ...base, pathname: "/forgot" })).toEqual({ type: "allow" });
    expect(decideRequest({ ...base, pathname: "/auth/reset" })).toEqual({ type: "allow" });
    expect(decideRequest({ ...base, pathname: "/auth/callback" })).toEqual({ type: "allow" });
    expect(decideRequest({ ...base, pathname: "/api/auth/session", method: "POST" })).toEqual({ type: "allow" });
    expect(decideRequest({ ...base, pathname: "/api/auth/forgot", method: "POST" })).toEqual({ type: "allow" });
    expect(decideRequest({ ...base, pathname: "/api/auth/dev", method: "POST" })).toEqual({ type: "unauthorized" });
  });

  it("fails closed when Supabase auth is not configured", () => {
    expect(decideRequest({ ...base, configured: false, pathname: "/contents" }).type).toBe("redirect");
    expect(decideRequest({ ...base, configured: false, pathname: "/api/jobs" })).toEqual({ type: "unauthorized" });
  });

  it("keeps admin pages and job edits off customer accounts", () => {
    expect(decideRequest({ ...base, pathname: "/admin/users", signedIn: true, role: "customer" })).toEqual({
      type: "redirect",
      pathname: "/account",
      search: "?error=admin",
    });
    expect(decideRequest({ ...base, pathname: "/admin/users", signedIn: true, role: "admin" })).toEqual({ type: "allow" });
    expect(decideRequest({ ...base, pathname: "/jobs/new", signedIn: true, role: "customer" })).toEqual({
      type: "redirect",
      pathname: "/",
      search: "",
    });
    expect(decideRequest({ ...base, pathname: "/jobs/new", signedIn: true, role: "estimator" })).toEqual({ type: "allow" });
    expect(decideRequest({ ...base, pathname: "/measure", signedIn: true, role: null })).toEqual({
      type: "redirect",
      pathname: "/account",
      search: "?error=role",
    });
    expect(decideRequest({ ...base, pathname: "/settings", signedIn: true, role: null })).toEqual({ type: "allow" });
    expect(decideRequest({ ...base, mode: "local", pathname: "/admin/users" })).toEqual({ type: "allow" });
  });

  it("checks shares, password length, and open redirects", () => {
    const shares = [{ jobId: "job-1", email: "Pat@Example.com" }];
    expect(canSeeJob({ openCatalog: false, role: "customer", email: "pat@example.com", jobId: "job-1", shares })).toBe(true);
    expect(canSeeJob({ openCatalog: false, role: "customer", email: "pat@example.com", jobId: "job-2", shares })).toBe(false);
    expect(canSeeJob({ openCatalog: false, role: "estimator", email: "e@example.com", jobId: "job-2", shares })).toBe(true);
    expect(canSeeJob({ openCatalog: false, role: "admin", email: "a@example.com", jobId: "job-b", jobOrgId: "org-b", viewerOrgId: "org-a", shares: [] })).toBe(false);
    expect(canSeeJob({ openCatalog: false, role: "admin", email: "a@example.com", jobId: "job-a", jobOrgId: "org-a", viewerOrgId: "org-a", shares: [] })).toBe(true);
    expect(canSeeJob({ openCatalog: false, role: "estimator", email: "a@example.com", jobId: "legacy", jobOrgId: null, viewerOrgId: "org-a", shares: [] })).toBe(false);
    expect(canSeeJob({ openCatalog: false, role: "estimator", email: "e@example.com", jobId: "job-b", jobOrgId: "org-b", viewerOrgId: null, shares: [] })).toBe(false);
    expect(canSeeJob({ openCatalog: true, role: "customer", email: "pat@example.com", jobId: "job-2", shares })).toBe(true);
    expect(canSeeJob({ openCatalog: false, role: null, email: "", jobId: "job-2", shares })).toBe(false);
    expect(canMutateJobs({ openCatalog: false, role: "customer" })).toBe(false);
    expect(canMutateJobs({ openCatalog: false, role: "admin" })).toBe(true);
    expect(canMutateJobs({ openCatalog: true, role: null })).toBe(true);
    expect(passwordProblem("short")).toMatch(/8/);
    expect(passwordProblem("long-enough")).toBeNull();
    expect(passwordHint("")).toMatch(/8/);
    expect(passwordHint("abcdefgh")).toMatch(/Weak/);
    expect(passwordHint("Long-Enough-1")).toMatch(/Strong/);
    expect(safeNext("https://evil.example")).toBe("/");
    expect(safeNext("//evil.example")).toBe("/");
    expect(safeNext("/%2F%2Fevil.example")).toBe("/");
    expect(safeNext("/measure?room=1")).toBe("/measure?room=1");
    expect(roleFromAppMetadata({ role: "admin" })).toBe("admin");
    expect(roleFromAppMetadata({ role: "owner" })).toBeNull();
    expect(SIGN_IN_ERROR).not.toMatch(/exist/i);
  });
});
