import type { PriceBook } from "./types";

/** Illustrative rates for the prototype. Not a local market survey and not a customer quote. */
export const DEMO_PRICE_BOOK: PriceBook = {
  id: "demo-illustrative-2026",
  name: "Illustrative—not a customer quote",
  currency: "USD",
  illustrative: true,
  disclaimer:
    "Rates are fictional demonstration numbers bundled with sample jobs. They are not a local price survey and not a quote. The estimate is built from the catalog and rate book.",
  items: [
    { code: "MIT-PROTECT", phase: "mitigation", description: "Protect adjacent finishes and contents", unit: "sqft", cost: { labor: 0.35, material: 0.22, equipment: 0.05, disposal: 0 }, minimumCharge: 85, taxable: false },
    { code: "MIT-EXTRACT", phase: "mitigation", description: "Extract standing water", unit: "sqft", cost: { labor: 0.7, material: 0.05, equipment: 0.55, disposal: 0.1 }, minimumCharge: 175, taxable: false },
    { code: "MIT-REMOVE-FINISH", phase: "mitigation", description: "Selective removal of affected finish", unit: "sqft", cost: { labor: 1.4, material: 0.15, equipment: 0.2, disposal: 0.35 }, minimumCharge: 150, taxable: false },
    { code: "MIT-DRY", phase: "mitigation", description: "Drying equipment and monitoring", unit: "sqft", cost: { labor: 0.45, material: 0.05, equipment: 1.1, disposal: 0 }, minimumCharge: 220, taxable: false },
    { code: "MIT-CLEAN", phase: "mitigation", description: "Clean affected hard surfaces", unit: "sqft", cost: { labor: 0.85, material: 0.2, equipment: 0.1, disposal: 0.05 }, minimumCharge: 95, taxable: false },
    { code: "MIT-DEBRIS", phase: "mitigation", description: "Bag and remove loose debris", unit: "each", cost: { labor: 45, material: 6, equipment: 0, disposal: 18 }, minimumCharge: 69, taxable: false },
    { code: "REB-DRYWALL", phase: "rebuild", description: "Install and finish drywall at removed area", unit: "sqft", cost: { labor: 2.4, material: 1.15, equipment: 0.15, disposal: 0.1 }, minimumCharge: 180, taxable: true },
    { code: "REB-PAINT", phase: "rebuild", description: "Prime and paint repaired area", unit: "sqft", cost: { labor: 1.1, material: 0.55, equipment: 0.05, disposal: 0 }, minimumCharge: 125, taxable: true },
    { code: "REB-BASE", phase: "rebuild", description: "Replace removed baseboard", unit: "lf", cost: { labor: 2.2, material: 1.4, equipment: 0.05, disposal: 0.1 }, minimumCharge: 75, taxable: true },
    { code: "REB-FLOOR", phase: "rebuild", description: "Install floor finish at removed area", unit: "sqft", cost: { labor: 3.1, material: 2.4, equipment: 0.15, disposal: 0.2 }, minimumCharge: 200, taxable: true },
    { code: "COND-INSPECT", phase: "mitigation", description: "Qualified moisture / cause inspection", unit: "each", cost: { labor: 180, material: 0, equipment: 25, disposal: 0 }, minimumCharge: 205, taxable: false },
    { code: "COND-TEST-HAZMAT", phase: "mitigation", description: "Qualified hazardous-material testing", unit: "each", cost: { labor: 0, material: 0, equipment: 0, disposal: 0 }, minimumCharge: 0, taxable: false },
    { code: "COND-HIDDEN", phase: "rebuild", description: "Conditional allowance for concealed damage", unit: "sqft", cost: { labor: 4, material: 2, equipment: 0.4, disposal: 0.4 }, minimumCharge: 0, taxable: true },
    { code: "OPT-UPGRADE", phase: "rebuild", description: "Optional customer-requested upgrade", unit: "each", cost: { labor: 0, material: 0, equipment: 0, disposal: 0 }, minimumCharge: 0, taxable: true },
  ],
};

export function emptyPriceBook(): PriceBook {
  return {
    id: "none",
    name: "No price book supplied",
    currency: "USD",
    illustrative: false,
    disclaimer: "No rates were loaded. Scope is unpriced.",
    items: [],
  };
}
