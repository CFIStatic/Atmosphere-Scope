import type { AccountRole } from "@/auth/gate";

export type LaborRate = { id: string; name: string; rate: string };

export type EstimateDefaults = {
  orgId: string;
  taxRate: string;
  overheadPct: string;
  profitPct: string;
  priceListRegion: string;
  laborRates: LaborRate[];
};

export type Profile = {
  userId: string;
  email: string;
  fullName: string;
  avatarUrl: string;
  onboardingComplete: boolean;
};

export type Org = {
  id: string;
  name: string;
  address: string;
  logoUrl: string;
  licenseNumbers: string;
};

export type Member = {
  orgId: string;
  userId: string;
  email: string;
  fullName: string;
  role: AccountRole;
  revokedAt: string | null;
};

export type NotificationPref = {
  userId: string;
  jobShared: boolean;
  invites: boolean;
};

export type JobEvent = {
  id: string;
  jobId: string;
  orgId: string | null;
  actorEmail: string;
  summary: string;
  createdAt: string;
};

export type UsageRow = {
  id: string;
  orgId: string | null;
  userEmail: string;
  jobId: string | null;
  model: string;
  inputTokens: number | null;
  outputTokens: number | null;
  costUsd: number | null;
  createdAt: string;
};

export type LocalCredential = {
  email: string;
  salt: string;
  passwordHash: string;
};

export function blankDefaults(orgId: string): EstimateDefaults {
  return { orgId, taxRate: "", overheadPct: "", profitPct: "", priceListRegion: "", laborRates: [] };
}

/** Empty stays empty. A typed number is kept. Nothing is filled in. */
export function cleanOptionalNumber(value: unknown): string {
  if (value == null) return "";
  const text = String(value).trim();
  if (!text) return "";
  if (!/^\d+(\.\d+)?$/.test(text)) throw new Error("Enter a number or leave the field empty.");
  return text;
}

export function cleanDefaults(orgId: string, input: Partial<EstimateDefaults> | null | undefined): EstimateDefaults {
  const labor = Array.isArray(input?.laborRates) ? input.laborRates : [];
  return {
    orgId,
    taxRate: cleanOptionalNumber(input?.taxRate),
    overheadPct: cleanOptionalNumber(input?.overheadPct),
    profitPct: cleanOptionalNumber(input?.profitPct),
    priceListRegion: String(input?.priceListRegion ?? "").trim(),
    laborRates: labor
      .map((row) => ({
        id: String(row?.id ?? "").trim() || crypto.randomUUID(),
        name: String(row?.name ?? "").trim(),
        rate: cleanOptionalNumber(row?.rate),
      }))
      .filter((row) => row.name || row.rate),
  };
}

export function defaultsSummary(defaults: EstimateDefaults | null): string {
  if (!defaults) return "";
  const bits = [
    defaults.taxRate ? `Tax ${defaults.taxRate}%` : "",
    defaults.overheadPct ? `Overhead ${defaults.overheadPct}%` : "",
    defaults.profitPct ? `Profit ${defaults.profitPct}%` : "",
    defaults.priceListRegion ? `Region ${defaults.priceListRegion}` : "",
  ].filter(Boolean);
  return bits.join(" · ");
}

/** Published list rates, dollars per token. Unknown models stay unpriced. */
const LIST_PRICE_PER_TOKEN: Record<string, { input: number; output: number }> = {
  "gpt-4o-mini": { input: 0.15 / 1_000_000, output: 0.6 / 1_000_000 },
  "gpt-4o": { input: 2.5 / 1_000_000, output: 10 / 1_000_000 },
  // developers.openai.com/api/docs/models/gpt-6-astra — $10 / $50 per 1M text tokens.
  "gpt-6-astra": { input: 10 / 1_000_000, output: 50 / 1_000_000 },
  "gpt-6-sol": { input: 2 / 1_000_000, output: 10 / 1_000_000 },
  "gpt-6-luna": { input: 0.1 / 1_000_000, output: 0.5 / 1_000_000 },
};

export function listCostUsd(model: string, inputTokens: number | null, outputTokens: number | null): number | null {
  const price = LIST_PRICE_PER_TOKEN[model];
  if (!price) return null;
  if (inputTokens == null && outputTokens == null) return null;
  const input = inputTokens ?? 0;
  const output = outputTokens ?? 0;
  return Math.round((input * price.input + output * price.output) * 1_000_000) / 1_000_000;
}
