"use client";

import { useState } from "react";

const TABS = ["Checklist", "Gaps", "Valuation", "Risk", "Scenarios", "Contents", "Baseline"] as const;

export function UnderwritingFlow({ pricingReady, pricingNote }: { pricingReady: boolean; pricingNote: string }) {
  const [tab, setTab] = useState<(typeof TABS)[number]>("Checklist");
  const [deductible, setDeductible] = useState(2500);
  const [ordinance, setOrdinance] = useState(false);

  return (
    <div className="flow">
      <div className="tabs" role="tablist">
        {TABS.map((item) => (
          <button key={item} type="button" role="tab" aria-selected={tab === item} onClick={() => setTab(item)}>{item}</button>
        ))}
      </div>
      {tab === "Checklist" && (
        <section className="phone">
          <div className="phone-top"><span>Mechanical</span><span>4 of 7</span></div>
          <div className="viewfinder">Fit the water-heater label plate here.</div>
          <p className="coach">Reported text is logged as narration, not as seen.</p>
          <div className="row">
            <span className="chip">Not verified</span>
            <span className="chip orange">Reported</span>
          </div>
          <p className="meta">Can&apos;t access leaves the item Not verified. Nothing on this checklist is a coverage decision.</p>
        </section>
      )}
      {tab === "Gaps" && (
        <section className="panel">
          <p className="kicker">Open items before the report</p>
          <p>Anything left open prints as Not verified. A missing label is not filled in from a typical model number.</p>
          <p className="meta">Generate report is allowed with open items. The PDF must keep the open count.</p>
        </section>
      )}
      {tab === "Valuation" && (
        <section className="panel">
          <p className="banner">Illustrative figures. The underwriter decides. These dollars are not from a price feed.</p>
          <table>
            <thead><tr><th>Component</th><th>Status</th><th>Replacement</th></tr></thead>
            <tbody>
              <tr><td>Dwelling, component build-up</td><td><span className="chip orange">Estimated</span></td><td>$842,000</td></tr>
              <tr><td>Other structures</td><td><span className="chip">Calculated</span></td><td>$84,200</td></tr>
              <tr><td>Coverage A suggestion</td><td>Underwriter decides</td><td>—</td></tr>
            </tbody>
          </table>
        </section>
      )}
      {tab === "Risk" && (
        <section className="panel">
          <p className="kicker">Risk inspection</p>
          <div className="row">
            <span className="chip blue">Observed</span>
            <span className="chip orange">Reported</span>
            <span className="chip">Not verified</span>
          </div>
          <p>Water, electrical, roof, and safety notes stay in those classes. This report refers questions to an inspector. It is not a decision.</p>
        </section>
      )}
      {tab === "Scenarios" && (
        <section className="panel">
          <p className="kicker">Loss scenario · illustrative</p>
          <label className="field">Deductible
            <select value={deductible} onChange={(event) => setDeductible(Number(event.target.value))}>
              <option value={1000}>$1,000</option>
              <option value={2500}>$2,500</option>
              <option value={5000}>$5,000</option>
            </select>
          </label>
          <label className="row"><input type="checkbox" checked={ordinance} onChange={(event) => setOrdinance(event.target.checked)} /> Ordinance endorsement (illustrative)</label>
          <p>Example loss $40,000. Deductible ${deductible.toLocaleString()}. Policy pays ${Math.max(0, 40000 - deductible).toLocaleString()} in this illustration{ordinance ? ", before any ordinance limit." : "."} You pay the deductible. Worst single event out of pocket starts at the deductible. Not a claim payment.</p>
        </section>
      )}
      {tab === "Contents" && (
        <section className="panel">
          <p className="kicker">Contents</p>
          {pricingReady ? (
            <p>{pricingNote} A walkthrough has to return an offer before a price is shown. Offers are not written into the estimate.</p>
          ) : (
            <p className="banner">{pricingNote}</p>
          )}
          <table>
            <thead><tr><th>Item</th><th>Evidence</th><th>Price</th></tr></thead>
            <tbody>
              <tr><td>Priced contents show up on Measure after a video is processed</td><td><span className="chip">Not verified</span></td><td>—</td></tr>
            </tbody>
          </table>
        </section>
      )}
      {tab === "Baseline" && (
        <section className="panel">
          <p className="kicker">Baseline</p>
          <p>Pre-loss condition is Not verified unless a photo or the inspection shows it. A narrative guess is not a baseline.</p>
        </section>
      )}
    </div>
  );
}
