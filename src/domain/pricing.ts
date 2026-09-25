import type { EstimateTotals, PriceBook, PricedLine, PricingSettings, Quantity, ScopeItem } from "./types";

export const DEFAULT_PRICING_SETTINGS: PricingSettings = {
  currency: "USD",
  locationName: "Unspecified",
  locationFactor: 1,
  overheadPercent: 0.1,
  mode: "markup",
  markupPercent: 0.2,
  marginPercent: 0.15,
  taxRate: 0,
  taxBase: "none",
  wasteFactor: 0,
  deductOpenings: true,
};

export function assertPricingMode(settings: PricingSettings): void {
  if (settings.mode !== "markup" && settings.mode !== "margin") {
    throw new Error("Pricing mode must be markup or margin, never both.");
  }
  if (settings.marginPercent >= 1) throw new Error("Margin must be below 100%.");
  if (settings.markupPercent < 0 || settings.marginPercent < 0) throw new Error("Markup and margin cannot be negative.");
}

export function unitCostOf(book: PriceBook, code: string): { cost: number; item: PriceBook["items"][number] } | null {
  const item = book.items.find((entry) => entry.code === code);
  if (!item) return null;
  const cost = item.cost.labor + item.cost.material + item.cost.equipment + item.cost.disposal;
  return { cost, item };
}

export function priceScopeItem(item: ScopeItem, book: PriceBook, settings: PricingSettings): PricedLine {
  assertPricingMode(settings);
  const base = {
    scopeItemId: item.id,
    unitCost: null,
    unitPrice: null,
    directCost: null,
    overhead: null,
    extendedPrice: null,
    tax: null,
    minimumApplied: false,
    pricingSource: book.illustrative ? `${book.name} (illustrative)` : book.name,
    unpricedReason: null as string | null,
  };
  if (item.scopeClass === "excluded") {
    return { ...base, unpricedReason: "Excluded from price.", extendedPrice: 0, tax: 0 };
  }
  const lookedUp = unitCostOf(book, item.code);
  if (!lookedUp) {
    return { ...base, unpricedReason: `No price-book rate for ${item.code}. Line left unpriced.` };
  }
  if (item.quantity.status === "unresolved" || item.quantity.value == null) {
    return {
      ...base,
      unitCost: roundMoney(lookedUp.cost * settings.locationFactor),
      unpricedReason: "Quantity is unresolved, so no extended amount was calculated.",
    };
  }
  const unitCost = lookedUp.cost * settings.locationFactor;
  let direct = unitCost * item.quantity.value;
  let minimumApplied = false;
  if (direct < lookedUp.item.minimumCharge) {
    direct = lookedUp.item.minimumCharge;
    minimumApplied = true;
  }
  const overhead = direct * settings.overheadPercent;
  const costPlusOverhead = direct + overhead;
  const unitPrice =
    settings.mode === "markup" ? unitCost * (1 + settings.markupPercent) : unitCost / (1 - settings.marginPercent);
  const price = settings.mode === "markup" ? costPlusOverhead * (1 + settings.markupPercent) : costPlusOverhead / (1 - settings.marginPercent);
  const materialPortion = (lookedUp.item.cost.material / lookedUp.cost) * price;
  let tax = 0;
  if (settings.taxBase === "all") tax = price * settings.taxRate;
  if (settings.taxBase === "materials") tax = materialPortion * settings.taxRate;
  return {
    ...base,
    unitCost: roundMoney(unitCost),
    unitPrice: roundMoney(unitPrice),
    directCost: roundMoney(direct),
    overhead: roundMoney(overhead),
    extendedPrice: roundMoney(price),
    tax: roundMoney(tax),
    minimumApplied,
  };
}

export function rollup(items: ScopeItem[], lines: PricedLine[], settings: PricingSettings): EstimateTotals {
  const byId = new Map(lines.map((line) => [line.scopeItemId, line]));
  let mitigationSubtotal = 0;
  let rebuildSubtotal = 0;
  let conditionalAllowance = 0;
  let optionalAllowance = 0;
  let overhead = 0;
  let tax = 0;
  let excludedCount = 0;
  const unresolvedLineIds: string[] = [];
  let pricedSupported = 0;
  let supportedCount = 0;

  for (const item of items) {
    const line = byId.get(item.id);
    if (item.scopeClass === "excluded") {
      excludedCount += 1;
      continue;
    }
    const amount = line?.extendedPrice;
    if (item.quantity.status === "unresolved" || amount == null) {
      unresolvedLineIds.push(item.id);
      continue;
    }
    if (item.scopeClass === "conditional") conditionalAllowance += amount;
    else if (item.scopeClass === "optional") optionalAllowance += amount;
    else {
      supportedCount += 1;
      pricedSupported += 1;
      if (item.phase === "mitigation") mitigationSubtotal += amount;
      else rebuildSubtotal += amount;
      overhead += line?.overhead ?? 0;
      tax += line?.tax ?? 0;
    }
  }

  const supportedTotal = mitigationSubtotal + rebuildSubtotal + tax;
  const label = unresolvedLineIds.length > 0 ? "partial" : items.some((item) => item.quantity.status === "provisional" && item.scopeClass === "supported") ? "provisional" : "complete";
  return {
    label: supportedCount === 0 && unresolvedLineIds.length > 0 ? "partial" : label,
    mitigationSubtotal: roundMoney(mitigationSubtotal),
    rebuildSubtotal: roundMoney(rebuildSubtotal),
    conditionalAllowance: roundMoney(conditionalAllowance),
    optionalAllowance: roundMoney(optionalAllowance),
    excludedCount,
    overhead: roundMoney(overhead),
    tax: roundMoney(tax),
    supportedTotal: roundMoney(supportedTotal),
    combinedWithAllowances: roundMoney(supportedTotal + conditionalAllowance + optionalAllowance),
    currency: settings.currency,
    unresolvedLineIds,
  };
}

export function priceAll(items: ScopeItem[], book: PriceBook, settings: PricingSettings): { lines: PricedLine[]; totals: EstimateTotals } {
  const lines = items.map((item) => priceScopeItem(item, book, settings));
  const totals = rollup(items, lines, settings);
  if (book.items.length === 0) totals.label = "partial";
  return { lines, totals };
}

export function roundMoney(value: number): number {
  return Math.round(value * 100) / 100;
}

export function quantitySignature(quantity: Quantity): string {
  return `${quantity.value ?? "null"}|${quantity.unit}|${quantity.status}|${quantity.formula ?? ""}`;
}
