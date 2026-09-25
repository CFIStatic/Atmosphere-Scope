import type { CatalogVersion, DraftLine } from "./catalog";
import { roundMoney } from "./pricing";

export type LaborRate = {
  trade: string;
  hourlyUsd: number | null;
  source: string;
  asOf: string | null;
};

export type EquipmentRate = {
  equipment: string;
  rateUsd: number | null;
  source: string;
  asOf: string | null;
};

export type RateBook = {
  id: string;
  version: number;
  region: string;
  overheadPercent: number;
  profitPercent: number;
  taxPercent: number;
  taxBase: "none" | "materials";
  labor: LaborRate[];
  equipment: EquipmentRate[];
  editedAt: string | null;
};

export type MaterialPrice = {
  query: string;
  unitPrice: number | null;
  source: string;
  asOf: string | null;
  status: "verified" | "unverified" | "unpriced";
};

export type ComponentPrice = {
  kind: "labor" | "material" | "equipment";
  label: string;
  amount: number | null;
  source: string;
  asOf: string | null;
};

export type PricedDraftLine = DraftLine & {
  componentsPriced: ComponentPrice[];
  direct: number | null;
  overhead: number | null;
  profit: number | null;
  tax: number | null;
  lineTotal: number | null;
  unpriced: string[];
};

export type EstimateReport = {
  schema: "atmosphere.estimate.v1";
  id: string;
  createdAt: string;
  status: "draft" | "final";
  catalogVersionId: string;
  rateBookId: string;
  region: string;
  settings: Pick<RateBook, "overheadPercent" | "profitPercent" | "taxPercent" | "taxBase">;
  lines: PricedDraftLine[];
  pricedTotal: number | null;
  unpricedCount: number;
  note: string;
};

export const STARTER_RATES: RateBook = {
  id: "rates-1",
  version: 1,
  region: "Unspecified",
  overheadPercent: 0.1,
  profitPercent: 0.1,
  taxPercent: 0,
  taxBase: "none",
  labor: [
    { trade: "general", hourlyUsd: null, source: "No rate entered", asOf: null },
    { trade: "carpenter", hourlyUsd: null, source: "No rate entered", asOf: null },
    { trade: "painter", hourlyUsd: null, source: "No rate entered", asOf: null },
    { trade: "floor", hourlyUsd: null, source: "No rate entered", asOf: null },
  ],
  equipment: [
    { equipment: "air mover", rateUsd: null, source: "No rate entered", asOf: null },
    { equipment: "dehumidifier", rateUsd: null, source: "No rate entered", asOf: null },
    { equipment: "extractor", rateUsd: null, source: "No rate entered", asOf: null },
  ],
  editedAt: null,
};

export function priceDraft(lines: DraftLine[], catalog: CatalogVersion, rates: RateBook, materials: MaterialPrice[]): EstimateReport {
  const priced = lines.map((line) => priceLine(line, rates, materials));
  const complete = priced.filter((line) => line.lineTotal != null);
  const unpricedCount = priced.length - complete.length;
  return {
    schema: "atmosphere.estimate.v1",
    id: `est_${catalog.id}_${rates.id}`,
    createdAt: rates.editedAt ?? catalog.publishedAt,
    status: "draft",
    catalogVersionId: catalog.id,
    rateBookId: rates.id,
    region: rates.region,
    settings: { overheadPercent: rates.overheadPercent, profitPercent: rates.profitPercent, taxPercent: rates.taxPercent, taxBase: rates.taxBase },
    lines: priced,
    pricedTotal: complete.length ? roundMoney(complete.reduce((sum, line) => sum + (line.lineTotal ?? 0), 0)) : null,
    unpricedCount,
    note: unpricedCount ? `${unpricedCount} line${unpricedCount === 1 ? "" : "s"} still unpriced. Missing labor, equipment, or material prices were not filled in.` : "Every component on these lines had a source. This is still a draft until it is finalized.",
  };
}

export function finalizeReport(report: EstimateReport, createdAt: string): EstimateReport {
  return { ...report, id: `${report.id}:final:${createdAt}`, createdAt, status: "final", note: `${report.note} Finalized on catalog ${report.catalogVersionId} and rates ${report.rateBookId}. Later edits do not change this copy.` };
}

export function reportCsv(report: EstimateReport): string {
  const header = ["catalog", "rates", "region", "status", "room", "code", "description", "qty", "unit", "line_total", "unpriced", "sources"];
  const rows = report.lines.map((line) => [
    report.catalogVersionId,
    report.rateBookId,
    csv(report.region),
    report.status,
    csv(line.room),
    line.code,
    csv(line.description),
    line.quantity ?? "",
    line.unit,
    line.lineTotal ?? "",
    csv(line.unpriced.join("; ")),
    csv(line.componentsPriced.map((component) => `${component.label} ${component.amount ?? "unpriced"} ${component.source} ${component.asOf ?? ""}`).join(" | ")),
  ].join(","));
  return [header.join(","), ...rows].join("\n");
}

function priceLine(line: DraftLine, rates: RateBook, materials: MaterialPrice[]): PricedDraftLine {
  const componentsPriced: ComponentPrice[] = [];
  const unpriced: string[] = [];
  if (line.quantity == null) unpriced.push("Quantity is missing.");
  let direct = 0;
  let materialAmount = 0;
  let complete = line.quantity != null;
  for (const component of line.components) {
    if (component.kind === "labor") {
      const rate = rates.labor.find((item) => item.trade === component.trade);
      const amount = rate?.hourlyUsd != null && line.quantity != null ? roundMoney(rate.hourlyUsd * component.hoursPerUnit * line.quantity) : null;
      componentsPriced.push({ kind: "labor", label: `${component.trade} labor`, amount, source: rate?.source ?? `No ${component.trade} rate in ${rates.region}`, asOf: rate?.asOf ?? null });
      if (amount == null) {
        complete = false;
        unpriced.push(`${component.trade} labor has no hourly rate.`);
      } else direct += amount;
    }
    if (component.kind === "equipment") {
      const rate = rates.equipment.find((item) => item.equipment === component.equipment);
      const amount = rate?.rateUsd != null && line.quantity != null ? roundMoney(rate.rateUsd * component.perUnit * line.quantity) : null;
      componentsPriced.push({ kind: "equipment", label: component.equipment, amount, source: rate?.source ?? `No ${component.equipment} rate in ${rates.region}`, asOf: rate?.asOf ?? null });
      if (amount == null) {
        complete = false;
        unpriced.push(`${component.equipment} has no equipment rate.`);
      } else direct += amount;
    }
    if (component.kind === "material") {
      const query = line.materialQuery || component.query;
      const offer = materials.find((item) => normalize(item.query) === normalize(query));
      const amount = offer?.unitPrice != null && line.quantity != null ? roundMoney(offer.unitPrice * line.quantity) : null;
      componentsPriced.push({
        kind: "material",
        label: query || "material",
        amount,
        source: offer ? `${offer.status}: ${offer.source}` : `No material price for ${query || "this item"}.`,
        asOf: offer?.asOf ?? null,
      });
      if (amount == null) {
        complete = false;
        unpriced.push(`No material price for ${query || "this item"}.`);
      } else {
        direct += amount;
        materialAmount += amount;
      }
    }
  }
  if (!complete) {
    return { ...line, componentsPriced, direct: null, overhead: null, profit: null, tax: null, lineTotal: null, unpriced };
  }
  const overhead = roundMoney(direct * rates.overheadPercent);
  const profit = roundMoney((direct + overhead) * rates.profitPercent);
  const taxBase = rates.taxBase === "materials" ? materialAmount : direct + overhead + profit;
  const tax = roundMoney(taxBase * rates.taxPercent);
  return { ...line, componentsPriced, direct: roundMoney(direct), overhead, profit, tax, lineTotal: roundMoney(direct + overhead + profit + tax), unpriced };
}

function csv(value: string): string {
  return `"${value.replace(/"/g, '""')}"`;
}

function normalize(value: string): string {
  return value.toLowerCase().replace(/\s+/g, " ").trim();
}
