"use client";

import { useEffect, useMemo, useState } from "react";
import { gapsFromSnapshot, loadWalkthrough, type WalkthroughSnapshot } from "@/capture/snapshot";
import { ResultsView } from "@/components/results-view";
import { buildResultLines, resultTotals } from "@/domain/results";
import { inventoryFromWalkthrough } from "@/analysis/inventory";

const TABS = ["Checklist", "Gaps", "Valuation", "Risk", "Scenarios", "Contents", "Baseline"] as const;
const CHECKS = ["Water heater label", "Electrical panel", "Roof", "Smoke alarms"];

export function UnderwritingFlow() {
  const [tab, setTab] = useState<(typeof TABS)[number]>("Checklist");
  const [snapshot, setSnapshot] = useState<WalkthroughSnapshot | null>(null);
  const [deductible, setDeductible] = useState(2500);
  useEffect(() => setSnapshot(loadWalkthrough()), []);
  const gaps = snapshot ? gapsFromSnapshot(snapshot) : [];
  const totals = useMemo(() => snapshot ? resultTotals(buildResultLines(inventoryFromWalkthrough(snapshot.objects, snapshot.plan), snapshot.offers)) : null, [snapshot]);

  return (
    <div className="flow">
      <div className="tabs" role="tablist">
        {TABS.map((item) => (
          <button key={item} type="button" role="tab" aria-selected={tab === item} onClick={() => setTab(item)}>{item}</button>
        ))}
      </div>
      {!snapshot && <p className="banner">No walkthrough is saved in this browser. Checklist items stay Not verified.</p>}
      {snapshot?.source === "recorded-preview" && <p className="banner">Recorded preview. Not an inspection.</p>}
      {tab === "Checklist" && (
        <section className="phone">
          <div className="phone-top"><span>Inspection</span><span>Not verified</span></div>
          {CHECKS.map((item) => (
            <p key={item} className="row"><span>{item}</span><span className="chip">Not verified</span></p>
          ))}
          <p className="meta">No inspection photo is attached. A missing label is not filled in. This is not a coverage decision.</p>
        </section>
      )}
      {tab === "Gaps" && (
        <section className="panel">
          <p className="kicker">Open items before the report</p>
          {gaps.length === 0 && <p>No open measurements on the saved plan. Generate report can still leave other items Not verified.</p>}
          {gaps.map((gap) => <p key={gap}>{gap}</p>)}
        </section>
      )}
      {tab === "Valuation" && (
        <section className="panel">
          <p className="banner">The underwriter decides. These rows are not a coverage suggestion.</p>
          <table>
            <thead><tr><th>Component</th><th>Status</th><th>Amount</th></tr></thead>
            <tbody>
              <tr><td>Dwelling</td><td><span className="chip">Not measured</span></td><td>—</td></tr>
              <tr><td>Contents from this walkthrough</td><td>{totals?.job == null ? <span className="chip">Unpriced</span> : <span className="chip orange">See the total note</span>}</td><td>{totals?.job ?? "—"}</td></tr>
            </tbody>
          </table>
          {totals && <p className="meta">{totals.note}</p>}
        </section>
      )}
      {tab === "Risk" && (
        <section className="panel">
          <p className="kicker">Risk inspection</p>
          <p>No risk notes were recorded on this walkthrough. Water, electrical, roof, and safety stay unobserved until a photo or a test is attached. This is not a decision.</p>
        </section>
      )}
      {tab === "Scenarios" && (
        <section className="panel">
          <p className="kicker">Loss scenario</p>
          {totals?.job == null ? <p>No priced total is available, so no loss was illustrated.</p> : (
            <>
              <label className="field">Deductible
                <select value={deductible} onChange={(event) => setDeductible(Number(event.target.value))}>
                  <option value={1000}>$1,000</option>
                  <option value={2500}>$2,500</option>
                  <option value={5000}>$5,000</option>
                </select>
              </label>
              <p>Starting figure ${totals.job.toLocaleString()}. Deductible ${deductible.toLocaleString()}. Remainder ${Math.max(0, totals.job - deductible).toLocaleString()} in this illustration. {totals.note} Not a claim payment.</p>
            </>
          )}
        </section>
      )}
      {tab === "Contents" && (snapshot ? <ResultsView plan={snapshot.plan} objects={snapshot.objects} offers={snapshot.offers} /> : <p className="meta">Contents stay blank until a walkthrough is saved.</p>)}
      {tab === "Baseline" && (
        <section className="panel">
          <p className="kicker">Baseline</p>
          <p><span className="chip">Not verified</span> No pre-loss photo is attached. A narrative guess is not a baseline.</p>
        </section>
      )}
    </div>
  );
}
