"use client";

import { useEffect, useMemo, useState } from "react";
import { gapsFromSnapshot, loadWalkthrough, saveWalkthrough, type WalkthroughSnapshot } from "@/capture/snapshot";
import { ResultsView } from "@/components/results-view";
import { buildResultLines, resultTotals } from "@/domain/results";
import { inventoryFromWalkthrough } from "@/analysis/inventory";

const TABS = ["Checklist", "Gaps", "Valuation", "Risk", "Scenarios", "Contents", "Baseline"] as const;
const CHECKS = ["Water heater label", "Electrical panel", "Roof", "Smoke alarms"];

export function UnderwritingFlow() {
  const [tab, setTab] = useState<(typeof TABS)[number]>("Checklist");
  const [snapshot, setSnapshot] = useState<WalkthroughSnapshot | null>(null);
  const [ready, setReady] = useState(false);
  const [deductible, setDeductible] = useState(2500);
  useEffect(() => {
    setSnapshot(loadWalkthrough());
    setReady(true);
  }, []);
  const gaps = snapshot ? gapsFromSnapshot(snapshot) : [];
  const totals = useMemo(() => snapshot ? resultTotals(buildResultLines(inventoryFromWalkthrough(snapshot.objects, snapshot.plan), snapshot.offers)) : null, [snapshot]);

  if (!ready) return null;
  if (!snapshot) {
    return (
      <div className="empty">
        <p>No walkthrough.</p>
        <a className="btn" href="/record">Record</a>
      </div>
    );
  }

  return (
    <div className="flow">
      <div className="tabs" role="tablist">
        {TABS.map((item) => (
          <button key={item} type="button" role="tab" aria-selected={tab === item} onClick={() => setTab(item)}>{item}</button>
        ))}
      </div>
      {snapshot.source === "recorded-preview" && <p className="meta">Sample. Not an inspection.</p>}
      {tab === "Checklist" && (
        <section className="phone">
          <div className="phone-top"><span>Inspection</span><span>Not verified</span></div>
          {CHECKS.map((item) => (
            <p key={item} className="row"><span>{item}</span><span className="chip">Not verified</span></p>
          ))}
          <p className="meta">Not a coverage decision.</p>
        </section>
      )}
      {tab === "Gaps" && (
        <section className="panel">
          <p className="meta">Not a coverage decision.</p>
          {gaps.map((gap) => <p key={gap}>{gap}</p>)}
        </section>
      )}
      {tab === "Valuation" && (
        <section className="panel">
          <p className="meta">Not a coverage decision.</p>
          <table className="data">
            <thead><tr><th>Component</th><th>Status</th><th>Amount</th></tr></thead>
            <tbody>
              <tr><td data-label="Component">Dwelling</td><td data-label="Status"><span className="chip">Not measured</span></td><td data-label="Amount">—</td></tr>
              <tr><td data-label="Component">Contents</td><td data-label="Status">{totals?.job == null ? <span className="tag">Needs price</span> : <span className="tag">Not verified</span>}</td><td className="num" data-label="Amount">{totals?.job == null ? "—" : totals.job.toLocaleString("en-US", { style: "currency", currency: "USD" })}</td></tr>
            </tbody>
          </table>
          {totals && <p className="meta">{totals.note}</p>}
        </section>
      )}
      {tab === "Risk" && (
        <section className="panel">
          <p className="meta">No risk notes on this walkthrough.</p>
        </section>
      )}
      {tab === "Scenarios" && (
        <section className="panel">
          <p className="kicker">Loss scenario</p>
          {totals?.job == null ? <p>No priced total.</p> : (
            <>
              <label className="field">Deductible
                <select value={deductible} onChange={(event) => setDeductible(Number(event.target.value))}>
                  <option value={1000}>$1,000</option>
                  <option value={2500}>$2,500</option>
                  <option value={5000}>$5,000</option>
                </select>
              </label>
              <p>Figure {totals.job.toLocaleString("en-US", { style: "currency", currency: "USD" })}. Deductible {deductible.toLocaleString("en-US", { style: "currency", currency: "USD" })}. Remainder {Math.max(0, totals.job - deductible).toLocaleString("en-US", { style: "currency", currency: "USD" })}. Not a claim payment.</p>
            </>
          )}
        </section>
      )}
      {tab === "Contents" && <ResultsView plan={snapshot.plan} objects={snapshot.objects} offers={snapshot.offers} onChange={({ offers, objects }) => {
        const next = { ...snapshot, offers, objects };
        setSnapshot(next);
        saveWalkthrough(next);
      }} />}
      {tab === "Baseline" && (
        <section className="panel">
          <p><span className="tag">Not verified</span></p>
        </section>
      )}
    </div>
  );
}
