/**
 * Provider-shaped vision result and a fixture scorer.
 * Adapted from Atmosphere `backend/src/verification/ai/analyzer.ts` (commit a9e2680).
 * The live call is OpenAI, in `src/analysis/openai/inventory.ts`. Tests use the scorer.
 */

export type AnalysisUsage = { inputTokens: number; outputTokens: number; latencyMs: number; estimatedCostUsd: number };

export type InventoryObservation = {
  label: string;
  category: string;
  condition: "ok" | "damaged" | "unclear";
  confidence: number;
};

export function parseInventoryPayload(raw: unknown): InventoryObservation[] {
  const objects = raw && typeof raw === "object" && Array.isArray((raw as { objects?: unknown }).objects) ? (raw as { objects: unknown[] }).objects : [];
  const parsed: InventoryObservation[] = [];
  for (const item of objects) {
    if (!item || typeof item !== "object") continue;
    const row = item as Record<string, unknown>;
    const label = typeof row.label === "string" ? row.label.trim() : "";
    if (!label) continue;
    const condition = row.condition === "ok" || row.condition === "damaged" || row.condition === "unclear" ? row.condition : "unclear";
    const confidence = typeof row.confidence === "number" && Number.isFinite(row.confidence) ? Math.min(1, Math.max(0, row.confidence)) : 0;
    parsed.push({ label, category: typeof row.category === "string" ? row.category : "other", condition, confidence });
  }
  return parsed;
}

export function scoreRecall(found: string[], expected: string[]): { hit: string[]; missed: string[] } {
  const have = new Set(found.map((label) => label.toLowerCase()));
  const hit = expected.filter((label) => have.has(label.toLowerCase()));
  const missed = expected.filter((label) => !have.has(label.toLowerCase()));
  return { hit, missed };
}

export type AnalyzerFixture = {
  slug: string;
  expectedLabels: string[];
  notes?: string;
};

export function evaluateFixture(fixture: AnalyzerFixture, observations: InventoryObservation[]): { slug: string; missed: string[] } {
  return { slug: fixture.slug, missed: scoreRecall(observations.map((item) => item.label), fixture.expectedLabels).missed };
}
