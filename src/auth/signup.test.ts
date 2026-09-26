import { mkdtemp, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { canSeeJob } from "@/auth/gate";
import { resetRateLimits } from "@/auth/rate-limit";
import { signupOutcome, signupPlan } from "@/auth/signup";
import { addMember, membershipFor } from "@/storage/workspace-book";

vi.mock("next/headers", () => ({
  cookies: async () => ({
    set: () => undefined,
    get: () => undefined,
    delete: () => undefined,
  }),
}));

import { POST } from "@/app/api/auth/signup/route";

let dir = "";
const previousStorage = process.env.STORAGE;
const previousDir = process.env.ACCOUNT_DATA_DIR;

function signupRequest(body: Record<string, string>, ip = "203.0.113.10") {
  return new Request("http://localhost/api/auth/signup", {
    method: "POST",
    headers: { "content-type": "application/json", "x-forwarded-for": ip },
    body: JSON.stringify(body),
  });
}

describe("public signup", () => {
  beforeEach(async () => {
    dir = await mkdtemp(path.join(tmpdir(), "scope-signup-"));
    process.env.STORAGE = "local";
    process.env.ACCOUNT_DATA_DIR = dir;
    resetRateLimits();
  });

  afterEach(async () => {
    process.env.STORAGE = previousStorage;
    process.env.ACCOUNT_DATA_DIR = previousDir;
    await rm(dir, { recursive: true, force: true });
  });

  it("opens a new company for the signer and joins an invite instead", () => {
    expect(signupPlan({ companyName: "  ", membership: null })).toMatchObject({ kind: "error" });
    expect(signupPlan({ companyName: "North Roofing", membership: null })).toEqual({
      kind: "create",
      role: "admin",
      companyName: "North Roofing",
    });
    expect(signupPlan({
      companyName: "Other Co",
      membership: { orgId: "org-1", role: "estimator", revoked: false },
    })).toEqual({ kind: "join", role: "estimator", orgId: "org-1" });
    expect(signupPlan({
      companyName: "Fresh Co",
      membership: { orgId: "org-1", role: "customer", revoked: true },
    })).toEqual({ kind: "create", role: "admin", companyName: "Fresh Co" });
  });

  it("treats a Supabase session as signed-in and an empty identity list as an existing account", () => {
    expect(signupOutcome({ error: null, hasSession: true, identityCount: 1 })).toBe("session");
    expect(signupOutcome({ error: null, hasSession: false, identityCount: 1 })).toBe("confirm");
    expect(signupOutcome({ error: null, hasSession: false, identityCount: null })).toBe("confirm");
    expect(signupOutcome({ error: null, hasSession: false, identityCount: 0 })).toBe("exists");
    expect(signupOutcome({ error: "User already registered", hasSession: false, identityCount: null })).toBe("exists");
  });

  it("rate-limits signup", async () => {
    for (let attempt = 0; attempt < 20; attempt += 1) {
      const response = await POST(signupRequest({ email: "" }, "203.0.113.20"));
      expect(response.status).toBe(400);
    }
    const blocked = await POST(signupRequest({ email: "a@example.com", password: "long-enough", fullName: "Ada", companyName: "Ada Co" }, "203.0.113.20"));
    expect(blocked.status).toBe(429);
  });

  it("creates an admin org with empty defaults, and an invitee does not open another org", async () => {
    const created = await POST(signupRequest({
      email: "ada@example.com",
      password: "long-enough",
      fullName: "Ada Lovelace",
      companyName: "Analytical Engines",
    }));
    expect(created.status).toBe(200);
    const createdBody = await created.json();
    expect(createdBody.needsEmailConfirmation).toBe(false);
    expect(createdBody.session.role).toBe("admin");
    expect(createdBody.joined).toBe(false);

    const ada = await membershipFor("ada@example.com");
    expect(ada?.member.role).toBe("admin");
    expect(ada?.org.name).toBe("Analytical Engines");
    expect(ada?.defaults).toMatchObject({ taxRate: "", overheadPct: "", profitPct: "", laborRates: [] });

    await addMember("ada@example.com", { email: "pat@example.com", role: "customer", userId: "pat@example.com" });
    const invited = await POST(signupRequest({
      email: "pat@example.com",
      password: "long-enough",
      fullName: "Pat Customer",
      companyName: "Should Not Exist",
    }, "203.0.113.11"));
    expect(invited.status).toBe(200);
    const invitedBody = await invited.json();
    expect(invitedBody.joined).toBe(true);
    expect(invitedBody.session.role).toBe("customer");
    const pat = await membershipFor("pat@example.com");
    expect(pat?.org.id).toBe(ada?.org.id);
    expect(pat?.member.role).toBe("customer");

    const book = JSON.parse(await readFile(path.join(dir, "book.json"), "utf8")) as { orgs: { id: string }[] };
    expect(book.orgs).toHaveLength(1);

    expect(canSeeJob({
      openCatalog: false,
      role: "admin",
      email: "pat@example.com",
      jobId: "job-ada",
      jobOrgId: ada?.org.id,
      viewerOrgId: "someone-elses-org",
      shares: [],
    })).toBe(false);
    expect(canSeeJob({
      openCatalog: false,
      role: "admin",
      email: "ada@example.com",
      jobId: "job-ada",
      jobOrgId: ada?.org.id,
      viewerOrgId: ada?.org.id,
      shares: [],
    })).toBe(true);
  });
});
