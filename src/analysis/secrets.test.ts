import { readdir, readFile } from "node:fs/promises";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { providerStatus } from "@/analysis/provider-status";

const ROOT = path.resolve(__dirname, "../..");
const SRC = path.join(ROOT, "src");

const SECRET_NAMES = [
  "OPENAI_API_KEY",
  "SERPAPI_API_KEY",
  "SUPABASE_SERVICE_ROLE_KEY",
  "SUPABASE_SECRET_KEY",
  "REPLICATE_API_TOKEN",
  "MODAL_TOKEN_ID",
  "MODAL_TOKEN_SECRET",
];

const SERVER_IMPORT = /@\/(?:analysis\/(?:config|openai|pricing-check|offer-cache|walkthrough|run-measurement|provider-status|adapters)|storage)(?:\/|["'])/;

export function clientSecretViolations(source: string): string[] {
  const hits: string[] = [];
  for (const name of SECRET_NAMES) {
    const read = new RegExp(String.raw`(?:process\.env|env)\s*(?:\.\s*${name}\b|\[\s*["']${name}["']\s*\])`);
    if (read.test(source)) hits.push(name);
    const trimmed = new RegExp(String.raw`trimmed\(\s*[^,]+,\s*["']${name}["']\s*\)`);
    if (trimmed.test(source)) hits.push(name);
  }
  if (/NEXT_PUBLIC_[A-Z0-9_]*(?:KEY|SECRET|TOKEN)\b/.test(source)) hits.push("NEXT_PUBLIC secret");
  if (/sk-[A-Za-z0-9_-]{20,}/.test(source)) hits.push("hardcoded key");
  if (SERVER_IMPORT.test(source)) hits.push("server import");
  return hits;
}

export function apiResponseLeaks(source: string): string[] {
  const hits: string[] = [];
  if (/NextResponse\.json\(\s*process\.env\b/.test(source)) hits.push("process.env");
  if (/JSON\.stringify\(\s*process\.env\b/.test(source)) hits.push("stringify process.env");
  for (const name of SECRET_NAMES) {
    const leaked = new RegExp(
      String.raw`NextResponse\.json\([\s\S]{0,500}(?:process\.env\.${name}|process\.env\[\s*["']${name}["']\s*\]|openaiKey\(|supabaseKey\()`,
    );
    if (leaked.test(source)) hits.push(name);
  }
  return hits;
}

async function filesUnder(dir: string): Promise<string[]> {
  const found: string[] = [];
  const entries = await readdir(dir, { withFileTypes: true });
  for (const entry of entries) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      if (entry.name === "node_modules" || entry.name === ".next") continue;
      found.push(...await filesUnder(full));
    } else if (/\.(ts|tsx|js|mjs|css)$/.test(entry.name)) found.push(full);
  }
  return found;
}

function importSpecifiers(source: string): string[] {
  const specs: string[] = [];
  const pattern = /import\s+(?:type\s+)?(?:[^'"\n]+?\s+from\s+)?["']([^"']+)["']/g;
  for (const match of source.matchAll(pattern)) {
    const clause = match[0];
    if (/import\s+type\s/.test(clause)) continue;
    specs.push(match[1]);
  }
  return specs;
}

async function resolveImport(fromFile: string, spec: string): Promise<string | null> {
  if (spec.startsWith("@/")) {
    return resolveExisting(path.join(SRC, spec.slice(2)));
  }
  if (spec.startsWith(".")) {
    return resolveExisting(path.resolve(path.dirname(fromFile), spec));
  }
  return null;
}

async function resolveExisting(base: string): Promise<string | null> {
  const candidates = [base, `${base}.ts`, `${base}.tsx`, `${base}.js`, path.join(base, "index.ts"), path.join(base, "index.tsx")];
  for (const candidate of candidates) {
    try {
      await readFile(candidate, "utf8");
      return candidate;
    } catch {
      // try the next extension
    }
  }
  return null;
}

describe("secrets stay on the server", () => {
  it("flags a client env read and ignores a sentence that names the variable", () => {
    expect(clientSecretViolations("const key = process.env.OPENAI_API_KEY")).toContain("OPENAI_API_KEY");
    expect(clientSecretViolations("const key = process.env['SERPAPI_API_KEY']")).toContain("SERPAPI_API_KEY");
    expect(clientSecretViolations('trimmed(env, "SUPABASE_SERVICE_ROLE_KEY")')).toContain("SUPABASE_SERVICE_ROLE_KEY");
    expect(clientSecretViolations("const key = process.env.NEXT_PUBLIC_OPENAI_API_KEY")).toContain("NEXT_PUBLIC secret");
    expect(clientSecretViolations("sk-abcdefghijklmnopqrstuvwxyz")).toContain("hardcoded key");
    expect(clientSecretViolations('import { x } from "@/analysis/config"')).toContain("server import");
    expect(clientSecretViolations("OPENAI_API_KEY is not set. Prices stay blank. Nothing was invented.")).toEqual([]);
  });

  it("does not reference a server key from the client graph or public files", async () => {
    const files = await filesUnder(SRC);
    const entries = [];
    for (const file of files) {
      const source = await readFile(file, "utf8");
      if (/^\s*["']use client["']/.test(source)) entries.push(file);
    }
    const seen = new Set<string>();
    const queue = [...entries];
    const problems: string[] = [];
    while (queue.length) {
      const file = queue.pop();
      if (!file || seen.has(file)) continue;
      seen.add(file);
      const source = await readFile(file, "utf8");
      const hits = clientSecretViolations(source);
      if (hits.length) problems.push(`${path.relative(ROOT, file)}: ${hits.join(", ")}`);
      for (const spec of importSpecifiers(source)) {
        const resolved = await resolveImport(file, spec);
        if (resolved) queue.push(resolved);
      }
    }
    const publicFiles = await filesUnder(path.join(ROOT, "public"));
    for (const file of publicFiles) {
      const hits = clientSecretViolations(await readFile(file, "utf8"));
      if (hits.length) problems.push(`${path.relative(ROOT, file)}: ${hits.join(", ")}`);
    }
    expect(problems).toEqual([]);
    expect(seen.size).toBeGreaterThan(0);
  });

  it("does not return a key from an API route or a provider note", async () => {
    const routes = (await filesUnder(path.join(SRC, "app", "api"))).filter((file) => file.endsWith("route.ts"));
    const leaks: string[] = [];
    for (const file of routes) {
      const hits = apiResponseLeaks(await readFile(file, "utf8"));
      if (hits.length) leaks.push(`${path.relative(ROOT, file)}: ${hits.join(", ")}`);
    }
    expect(leaks).toEqual([]);
    const secret = "sk-test-secret-value-should-not-leak";
    const text = JSON.stringify(providerStatus({
      OPENAI_API_KEY: secret,
      SERPAPI_API_KEY: "serp-secret-value",
      SUPABASE_SERVICE_ROLE_KEY: "service-role-secret-value",
      REPLICATE_API_TOKEN: "replicate-secret-value",
    }));
    expect(text).not.toContain(secret);
    expect(text).not.toContain("serp-secret-value");
    expect(text).not.toContain("service-role-secret-value");
    expect(text).not.toContain("replicate-secret-value");
  });
});
