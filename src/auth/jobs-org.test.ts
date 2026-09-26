import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

describe("job org policies", () => {
  it("scopes job reads to the caller's company", () => {
    const sql = readFileSync(path.join(process.cwd(), "supabase/migrations/20260926190000_jobs_org_rls.sql"), "utf8");
    expect(sql).toMatch(/org_id in \(select public\.scope_org_ids\(\)\)/);
    expect(sql).not.toMatch(/app_metadata/);
    expect(sql).toMatch(/job_shares/);
  });
});
