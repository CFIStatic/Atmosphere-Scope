import { createId, nowIso } from "./ids";
import { priceAll } from "./pricing";
import type { Actor, EstimateStatus, EstimateVersion, Job, PriceBook, ScopeItem } from "./types";
import { DRAFT_BANNER } from "./types";

const LOCKED: EstimateStatus[] = ["estimator_approved", "customer_authorized", "superseded"];

export function isLockedStatus(status: EstimateStatus): boolean {
  return LOCKED.includes(status);
}

export function bannerFor(version: EstimateVersion | null): string {
  if (!version) return DRAFT_BANNER;
  if (version.status === "ai_draft") return DRAFT_BANNER;
  if (version.status === "estimator_reviewed") return "Estimator reviewed — not approved";
  if (version.status === "estimator_approved") return "Estimator-approved proposal — not customer-authorized";
  if (version.status === "customer_authorized") return `Customer authorized version ${version.number}`;
  return "Superseded version";
}

export function createEstimateVersion(input: {
  job: Job;
  items: ScopeItem[];
  book: PriceBook;
  actor: Actor;
  parentVersionId?: string | null;
  changeRequest?: string | null;
  status?: EstimateStatus;
}): EstimateVersion {
  const number = input.job.estimates.reduce((max, version) => Math.max(max, version.number), 0) + 1;
  const { lines, totals } = priceAll(input.items, input.book, input.job.estimates.at(-1)?.settings ?? defaultSettings(input.job));
  const settings = input.job.estimates.at(-1)?.settings ?? defaultSettings(input.job);
  return {
    id: createId("est"),
    number,
    status: input.status ?? "ai_draft",
    parentVersionId: input.parentVersionId ?? null,
    changeRequest: input.changeRequest ?? null,
    scopeItemIds: input.items.map((item) => item.id),
    pricedLines: lines,
    totals,
    settings,
    priceBookId: input.book.id,
    priceBookLabel: input.book.name,
    assumptions: collectAssumptions(input.items, input.book),
    exclusions: collectExclusions(input.items),
    createdAt: nowIso(),
    createdBy: input.actor,
    reviewedAt: null,
    reviewedBy: null,
    approvedAt: null,
    approvedBy: null,
    authorizedAt: null,
    authorizedBy: null,
    authorizationStatement: null,
  };
}

function defaultSettings(job: Job) {
  return job.estimates[0]?.settings ?? {
    currency: "USD" as const,
    locationName: job.property.region || "Unspecified",
    locationFactor: 1,
    overheadPercent: 0.1,
    mode: "markup" as const,
    markupPercent: 0.2,
    marginPercent: 0.15,
    taxRate: 0,
    taxBase: "none" as const,
    wasteFactor: 0,
    deductOpenings: true,
  };
}

function collectAssumptions(items: ScopeItem[], book: PriceBook): string[] {
  const assumptions = new Set<string>([book.disclaimer, "Quantities follow linked geometry or explicit affected areas."]);
  for (const item of items) item.assumptions.forEach((note) => assumptions.add(note));
  return [...assumptions];
}

function collectExclusions(items: ScopeItem[]): string[] {
  const exclusions = new Set<string>([
    "Hazardous-material testing and abatement unless a qualified result is attached.",
    "Structural, electrical, and plumbing safety evaluations.",
    "Concealed conditions not opened and recorded.",
  ]);
  for (const item of items) item.exclusions.forEach((note) => exclusions.add(note));
  return [...exclusions];
}

export function markReviewed(version: EstimateVersion, actor: Actor): EstimateVersion {
  if (actor.role !== "estimator") throw new Error("Only an estimator can mark a version reviewed.");
  if (version.status !== "ai_draft") throw new Error("Only an AI draft can be marked reviewed.");
  return { ...version, status: "estimator_reviewed", reviewedAt: nowIso(), reviewedBy: actor };
}

export function approveEstimate(version: EstimateVersion, actor: Actor): EstimateVersion {
  if (actor.role !== "estimator") throw new Error("Only an estimator can approve a proposal.");
  if (actor.role === "estimator" && version.createdBy.role === "ai" && version.status === "ai_draft") {
    throw new Error("AI output cannot be approved in place. Mark it reviewed first.");
  }
  if (version.status !== "estimator_reviewed") throw new Error("Approval requires an estimator-reviewed version.");
  return { ...version, status: "estimator_approved", approvedAt: nowIso(), approvedBy: actor };
}

export function authorizeEstimate(version: EstimateVersion, actor: Actor, statement: string): EstimateVersion {
  if (actor.role !== "customer") throw new Error("Customer authorization is a separate act from estimator approval.");
  if (version.status !== "estimator_approved") throw new Error("The customer can only authorize an estimator-approved version.");
  if (!statement.trim()) throw new Error("Authorization must identify the accepted version.");
  return {
    ...version,
    status: "customer_authorized",
    authorizedAt: nowIso(),
    authorizedBy: actor,
    authorizationStatement: `${statement.trim()} Accepted estimate ${version.id} (v${version.number}).`,
  };
}

export function supersede(version: EstimateVersion): EstimateVersion {
  return { ...version, status: "superseded" };
}

export function activeEstimate(job: Job): EstimateVersion | null {
  return job.estimates.find((version) => version.id === job.activeEstimateId) ?? job.estimates.at(-1) ?? null;
}

export function proposalChangesRequireRevision(version: EstimateVersion | null): boolean {
  return !!version && (version.status === "estimator_approved" || version.status === "customer_authorized");
}
