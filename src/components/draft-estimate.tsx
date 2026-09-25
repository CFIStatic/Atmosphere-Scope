"use client";

import { useEffect, useMemo, useState, type Dispatch, type SetStateAction } from "react";
import { saveWalkthrough, type WalkthroughSnapshot } from "@/capture/snapshot";
import { draftScope, type CatalogComponent, type CatalogItem, type CatalogTrigger, type CatalogVersion, type LossType } from "@/domain/catalog";
import { finalizeReport, priceDraft, type EquipmentRate, type EstimateReport, type LaborRate, type MaterialPrice, type PricedDraftLine, type RateBook } from "@/domain/estimate-engine";
import type { ResultOffer } from "@/domain/results";

type RateDraft = {
  region: string;
  overhead: string;
  profit: string;
  tax: string;
  taxBase: "none" | "materials";
  labor: { trade: string; hourly: string; source: string; asOf: string }[];
  equipment: { equipment: string; rate: string; source: string; asOf: string }[];
};

export function DraftEstimate({ snapshot, onSnapshot }: { snapshot: WalkthroughSnapshot; onSnapshot: (next: WalkthroughSnapshot) => void }) {
  const [catalog, setCatalog] = useState<CatalogVersion | null>(null);
  const [rates, setRates] = useState<RateBook | null>(null);
  const [loss, setLoss] = useState<LossType>("none");
  const [rateDraft, setRateDraft] = useState<RateDraft | null>(null);
  const [items, setItems] = useState<CatalogItem[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    Promise.all([fetch("/api/catalog").then((response) => response.json()), fetch("/api/rates").then((response) => response.json())])
      .then(([catalogBody, rateBody]) => {
        if (cancelled) return;
        if (!catalogBody?.current?.items || !rateBody?.labor) {
          setError("The catalog or rate book did not load. Nothing was filled in.");
          return;
        }
        setCatalog(catalogBody.current);
        setItems(catalogBody.current.items);
        setRates(rateBody);
        setRateDraft(toRateDraft(rateBody));
      })
      .catch(() => {
        if (!cancelled) setError("The catalog or rate book did not load. Nothing was filled in.");
      });
    return () => {
      cancelled = true;
    };
  }, []);

  const materials = useMemo(() => materialsFromOffers(snapshot.offers), [snapshot.offers]);
  const live = useMemo(() => {
    if (!catalog || !rates) return null;
    return priceDraft(draftScope({ plan: snapshot.plan, objects: snapshot.objects, catalog, loss }), catalog, rates, materials);
  }, [catalog, rates, snapshot.plan, snapshot.objects, loss, materials]);

  async function saveRates() {
    if (!rateDraft) return;
    const built = ratesFromDraft(rateDraft);
    if ("error" in built) {
      setError(built.error);
      return;
    }
    setError(null);
    setBusy("rates");
    const response = await fetch("/api/rates", { method: "PUT", headers: { "content-type": "application/json" }, body: JSON.stringify(built.rates) });
    const payload = await response.json();
    setBusy(null);
    if (!response.ok) {
      setError(payload.error ?? "The rate book was not saved.");
      return;
    }
    setRates(payload);
    setRateDraft(toRateDraft(payload));
  }

  async function publishCatalog() {
    const invalid = items.find((item) => !item.code.trim() || !item.description.trim());
    if (invalid) {
      setError("Each catalog line needs a code and a description.");
      return;
    }
    setError(null);
    setBusy("catalog");
    const response = await fetch("/api/catalog", { method: "PUT", headers: { "content-type": "application/json" }, body: JSON.stringify({ items }) });
    const payload = await response.json();
    setBusy(null);
    if (!response.ok || !payload.current) {
      setError(payload.error ?? "The catalog was not published.");
      return;
    }
    setCatalog(payload.current);
    setItems(payload.current.items);
  }

  function finalize() {
    if (!live) return;
    if (snapshot.finalReport && !window.confirm("Replace the finalized copy with this draft?")) return;
    const finalReport = finalizeReport(live, new Date().toISOString());
    const next = { ...snapshot, finalReport };
    saveWalkthrough(next);
    onSnapshot(next);
  }

  return (
    <div className="grid">
      <section className="panel grid">
        <label className="field">Loss
          <select value={loss} onChange={(event) => setLoss(event.target.value as LossType)}>
            <option value="none">None</option>
            <option value="water">Water</option>
            <option value="fire">Fire</option>
          </select>
        </label>
        {error && <p className="error">{error}</p>}
      </section>
      {snapshot.finalReport && <ReportBlock title="Finalized estimate" report={snapshot.finalReport} locked />}
      {live && <ReportBlock title={snapshot.finalReport ? "Current draft" : "Estimate"} report={live} />}
      <div className="row action-bar">
        <button className="btn" type="button" disabled={!live} onClick={finalize}>Finalize estimate</button>
        <button className="btn secondary" type="button" disabled={!live && !snapshot.finalReport} onClick={() => send("pdf", snapshot.finalReport ?? live)}>Send report (PDF)</button>
        <button className="btn secondary" type="button" disabled={!live && !snapshot.finalReport} onClick={() => send("csv", snapshot.finalReport ?? live)}>Send report (CSV)</button>
        <button className="btn secondary" type="button" disabled={!live && !snapshot.finalReport} onClick={() => send("json", snapshot.finalReport ?? live)}>Send report (JSON)</button>
      </div>
      {rateDraft && (
        <details className="panel">
          <summary>Admin · regional rates</summary>
          <form className="grid" onSubmit={(event) => { event.preventDefault(); void saveRates(); }}>
            <div className="form-grid">
              <label className="field">Region<input value={rateDraft.region} onChange={(event) => setRateDraft({ ...rateDraft, region: event.target.value })} /></label>
              <label className="field">Overhead %<input value={rateDraft.overhead} inputMode="decimal" onChange={(event) => setRateDraft({ ...rateDraft, overhead: event.target.value })} /></label>
              <label className="field">Profit %<input value={rateDraft.profit} inputMode="decimal" onChange={(event) => setRateDraft({ ...rateDraft, profit: event.target.value })} /></label>
              <label className="field">Tax %<input value={rateDraft.tax} inputMode="decimal" onChange={(event) => setRateDraft({ ...rateDraft, tax: event.target.value })} /></label>
              <label className="field">Tax base
                <select value={rateDraft.taxBase} onChange={(event) => setRateDraft({ ...rateDraft, taxBase: event.target.value === "materials" ? "materials" : "none" })}>
                  <option value="none">On the line after overhead and profit</option>
                  <option value="materials">Materials only</option>
                </select>
              </label>
            </div>
            <p className="kicker">Labor, hourly</p>
            {rateDraft.labor.map((row, index) => (
              <div className="form-grid" key={row.trade}>
                <label className="field">{row.trade}<input aria-label={`${row.trade} hourly`} value={row.hourly} inputMode="decimal" placeholder="No rate" onChange={(event) => updateLabor(setRateDraft, index, { hourly: event.target.value })} /></label>
                <label className="field">Source<input aria-label={`${row.trade} source`} value={row.source} onChange={(event) => updateLabor(setRateDraft, index, { source: event.target.value })} /></label>
                <label className="field">As of<input aria-label={`${row.trade} date`} type="date" value={row.asOf} onChange={(event) => updateLabor(setRateDraft, index, { asOf: event.target.value })} /></label>
              </div>
            ))}
            <p className="kicker">Equipment</p>
            {rateDraft.equipment.map((row, index) => (
              <div className="form-grid" key={row.equipment}>
                <label className="field">{row.equipment}<input aria-label={`${row.equipment} rate`} value={row.rate} inputMode="decimal" placeholder="No rate" onChange={(event) => updateEquipment(setRateDraft, index, { rate: event.target.value })} /></label>
                <label className="field">Source<input aria-label={`${row.equipment} source`} value={row.source} onChange={(event) => updateEquipment(setRateDraft, index, { source: event.target.value })} /></label>
                <label className="field">As of<input aria-label={`${row.equipment} date`} type="date" value={row.asOf} onChange={(event) => updateEquipment(setRateDraft, index, { asOf: event.target.value })} /></label>
              </div>
            ))}
            <button className="btn" type="submit" disabled={busy === "rates"}>Save rate book</button>
            <p className="meta">A rate needs a source and a date. A blank amount stays unpriced. Saving publishes the next rate-book version. A finalized estimate keeps the version it already used.</p>
          </form>
        </details>
      )}
      {catalog && (
        <details className="panel">
          <summary>Catalog</summary>
          <p className="meta">Publishing adds a version. A finalized estimate keeps the one it already used.</p>
          {items.map((item, index) => (
            <div className="item" key={`${item.code}-${index}`}>
              <div className="form-grid">
                <label className="field">Code<input aria-label={`Code ${index}`} value={item.code} onChange={(event) => updateItem(setItems, index, { code: event.target.value })} /></label>
                <label className="field">Category
                  <select aria-label={`Category ${index}`} value={item.category} onChange={(event) => updateItem(setItems, index, { category: event.target.value as CatalogItem["category"] })}>
                    <option value="mitigation">mitigation</option>
                    <option value="rebuild">rebuild</option>
                    <option value="contents">contents</option>
                  </select>
                </label>
                <label className="field">Description<input aria-label={`Description ${index}`} value={item.description} onChange={(event) => updateItem(setItems, index, { description: event.target.value })} /></label>
                <label className="field">Unit
                  <select aria-label={`Unit ${index}`} value={item.unit} onChange={(event) => updateItem(setItems, index, { unit: event.target.value as CatalogItem["unit"] })}>
                    <option value="sqft">sqft</option>
                    <option value="lf">lf</option>
                    <option value="each">each</option>
                  </select>
                </label>
                <label className="field">Quantity from
                  <select aria-label={`Basis ${index}`} value={item.basis} onChange={(event) => updateItem(setItems, index, { basis: event.target.value as CatalogItem["basis"] })}>
                    <option value="floor_area">floor area</option>
                    <option value="wall_area">wall area</option>
                    <option value="baseboard">baseboard</option>
                    <option value="each">each</option>
                  </select>
                </label>
                <fieldset className="field">
                  <legend>Shows when</legend>
                  {(["sketch", "water", "fire", "contents"] as CatalogTrigger[]).map((trigger) => (
                    <label key={trigger}>
                      <input
                        type="checkbox"
                        aria-label={`${item.code || "line"} ${trigger}`}
                        checked={item.triggers.includes(trigger)}
                        onChange={(event) => updateItem(setItems, index, { triggers: event.target.checked ? [...item.triggers, trigger] : item.triggers.filter((value) => value !== trigger) })}
                      /> {trigger}
                    </label>
                  ))}
                </fieldset>
              </div>
              <div className="form-grid">
                {item.components.map((component, componentIndex) => (
                  <label className="field" key={`${component.kind}-${componentIndex}`}>
                    {component.kind === "labor" ? `${component.trade} hours per unit` : component.kind === "material" ? "Material name" : `${component.equipment} per unit`}
                    <input
                      aria-label={`${item.code} ${component.kind} ${componentIndex}`}
                      value={component.kind === "material" ? component.query : String(component.kind === "labor" ? component.hoursPerUnit : component.perUnit)}
                      onChange={(event) => updateComponent(setItems, index, componentIndex, event.target.value)}
                    />
                  </label>
                ))}
              </div>
            </div>
          ))}
          <div className="row">
            <button className="btn secondary" type="button" onClick={() => setItems((current) => [...current, { code: "", category: "rebuild", description: "", unit: "sqft", basis: "floor_area", triggers: ["sketch"], components: [{ kind: "labor", trade: "general", hoursPerUnit: 0.05 }] }])}>Add line</button>
            <button className="btn" type="button" disabled={busy === "catalog"} onClick={() => void publishCatalog()}>Publish catalog version</button>
          </div>
        </details>
      )}
    </div>
  );
}

function ReportBlock({ title, report, locked }: { title: string; report: EstimateReport; locked?: boolean }) {
  return (
    <section className="panel grid">
      <div className="row">
        <h2>{title}</h2>
        <span className="chip">{locked ? "Final" : "Draft"}</span>
        {report.unpricedCount > 0 && <span className="chip">Needs price</span>}
      </div>
      {report.unpricedCount > 0 && <p className="meta">Unpriced lines stay blank.</p>}
      <table className="stack">
        <thead><tr><th>Room</th><th>Code</th><th>Description</th><th>Qty</th><th>Line</th></tr></thead>
        <tbody>
          {report.lines.map((line, index) => (
            <tr key={`${line.code}-${line.room}-${index}`}>
              <td data-label="Room">{line.room}</td>
              <td data-label="Code">{line.code}</td>
              <td data-label="Description">
                {line.description}
                <div className="meta">{line.quantityNote}</div>
                <ComponentList line={line} />
              </td>
              <td data-label="Qty">{line.quantity == null ? "—" : `${line.quantity} ${line.unit}`}</td>
              <td data-label="Line">{line.lineTotal == null ? "Needs price" : money(line.lineTotal)}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </section>
  );
}

function ComponentList({ line }: { line: PricedDraftLine }) {
  return (
    <ul>
      {line.componentsPriced.map((component) => (
        <li key={`${component.kind}-${component.label}`}>
          {component.label}: {component.amount == null ? "Needs price" : money(component.amount)}
        </li>
      ))}
      {line.unpriced.map((gap) => <li key={gap}>{gap}</li>)}
    </ul>
  );
}

async function send(format: "pdf" | "csv" | "json", report: EstimateReport | null) {
  if (!report) return;
  const response = await fetch("/api/estimate/report", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ report, format }),
  });
  if (!response.ok) return;
  const blob = await response.blob();
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = format === "pdf" ? "estimate.pdf" : format === "csv" ? "estimate.csv" : "estimate.json";
  link.click();
  URL.revokeObjectURL(url);
}

function materialsFromOffers(offers: ResultOffer[]): MaterialPrice[] {
  return offers.map((offer) => ({
    query: offer.query,
    unitPrice: offer.price,
    source: [offer.retailer, offer.note].filter(Boolean).join(" — ") || "Replacement search",
    asOf: null,
    status: offer.status,
  }));
}

function toRateDraft(rates: RateBook): RateDraft {
  return {
    region: rates.region,
    overhead: String(rates.overheadPercent * 100),
    profit: String(rates.profitPercent * 100),
    tax: String(rates.taxPercent * 100),
    taxBase: rates.taxBase,
    labor: rates.labor.map((rate) => ({ trade: rate.trade, hourly: rate.hourlyUsd == null ? "" : String(rate.hourlyUsd), source: rate.source, asOf: rate.asOf ?? "" })),
    equipment: rates.equipment.map((rate) => ({ equipment: rate.equipment, rate: rate.rateUsd == null ? "" : String(rate.rateUsd), source: rate.source, asOf: rate.asOf ?? "" })),
  };
}

function ratesFromDraft(draft: RateDraft): { rates: Omit<RateBook, "id" | "version"> } | { error: string } {
  const labor: LaborRate[] = [];
  for (const row of draft.labor) {
    const parsed = priced(row.hourly, row.source, row.asOf, `${row.trade} labor`);
    if ("error" in parsed) return parsed;
    labor.push({ trade: row.trade, hourlyUsd: parsed.amount, source: parsed.source, asOf: parsed.asOf });
  }
  const equipment: EquipmentRate[] = [];
  for (const row of draft.equipment) {
    const parsed = priced(row.rate, row.source, row.asOf, row.equipment);
    if ("error" in parsed) return parsed;
    equipment.push({ equipment: row.equipment, rateUsd: parsed.amount, source: parsed.source, asOf: parsed.asOf });
  }
  const overheadPercent = percent(draft.overhead);
  const profitPercent = percent(draft.profit);
  const taxPercent = percent(draft.tax);
  if (overheadPercent == null || profitPercent == null || taxPercent == null) return { error: "Overhead, profit, and tax need a number, or stay as they were." };
  return {
    rates: {
      region: draft.region.trim() || "Unspecified",
      overheadPercent,
      profitPercent,
      taxPercent,
      taxBase: draft.taxBase,
      labor,
      equipment,
      editedAt: null,
    },
  };
}

function priced(raw: string, source: string, asOf: string, label: string): { amount: number | null; source: string; asOf: string | null } | { error: string } {
  if (raw.trim() === "") return { amount: null, source: "No rate entered", asOf: null };
  const amount = Number(raw);
  if (!Number.isFinite(amount) || amount < 0) return { error: `${label} needs a blank or a non-negative amount.` };
  if (!source.trim() || source.trim() === "No rate entered" || !asOf) return { error: `${label} needs a source and a date before it can be saved.` };
  return { amount, source: source.trim(), asOf };
}

function percent(raw: string): number | null {
  const value = Number(raw);
  if (!Number.isFinite(value) || value < 0) return null;
  return value / 100;
}

function updateLabor(setRateDraft: Dispatch<SetStateAction<RateDraft | null>>, index: number, patch: Partial<RateDraft["labor"][number]>) {
  setRateDraft((current) => current && { ...current, labor: current.labor.map((row, rowIndex) => (rowIndex === index ? { ...row, ...patch } : row)) });
}

function updateEquipment(setRateDraft: Dispatch<SetStateAction<RateDraft | null>>, index: number, patch: Partial<RateDraft["equipment"][number]>) {
  setRateDraft((current) => current && { ...current, equipment: current.equipment.map((row, rowIndex) => (rowIndex === index ? { ...row, ...patch } : row)) });
}

function updateItem(setItems: Dispatch<SetStateAction<CatalogItem[]>>, index: number, patch: Partial<CatalogItem>) {
  setItems((current) => current.map((item, itemIndex) => (itemIndex === index ? { ...item, ...patch } : item)));
}

function updateComponent(setItems: Dispatch<SetStateAction<CatalogItem[]>>, itemIndex: number, componentIndex: number, raw: string) {
  setItems((current) => current.map((item, index) => {
    if (index !== itemIndex) return item;
    const components = item.components.map((component, index) => (index === componentIndex ? editComponent(component, raw) : component));
    return { ...item, components };
  }));
}

function editComponent(component: CatalogComponent, raw: string): CatalogComponent {
  if (component.kind === "material") return { ...component, query: raw };
  const value = Number(raw);
  if (!Number.isFinite(value) || value < 0) return component;
  if (component.kind === "labor") return { ...component, hoursPerUnit: value };
  return { ...component, perUnit: value };
}

function money(value: number | null): string {
  return value == null ? "Needs price" : `$${value.toFixed(2)}`;
}
