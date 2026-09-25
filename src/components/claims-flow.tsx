"use client";

import { useEffect, useState } from "react";
import { gapsFromSnapshot, loadWalkthrough, saveWalkthrough, type WalkthroughSnapshot } from "@/capture/snapshot";
import { PlanView } from "@/components/plan-view";
import { ResultsView } from "@/components/results-view";

type Row = {
  kind: string;
  truthFt: number;
  valueFt: number | null;
  actualPercent: number | null;
  errorPercent: number | null;
  meetsAccuracyTarget: boolean;
};

const STEPS = ["Capture", "Gaps", "Review", "Draft estimate"] as const;

export function ClaimsFlow({ walls, height }: { walls: Row[]; height: Row | null }) {
  const [step, setStep] = useState<(typeof STEPS)[number]>("Capture");
  const [snapshot, setSnapshot] = useState<WalkthroughSnapshot | null>(null);
  useEffect(() => setSnapshot(loadWalkthrough()), []);
  const gaps = snapshot ? gapsFromSnapshot(snapshot) : [];

  return (
    <div className="flow">
      <p className="kicker">Capture, gaps, review, then a draft. Estimator approval is a later sign-in. Customer authorization is a separate sign-in.</p>
      <div className="tabs" role="tablist">
        {STEPS.map((item) => (
          <button key={item} type="button" role="tab" aria-selected={step === item} onClick={() => setStep(item)}>{item}</button>
        ))}
      </div>
      {!snapshot && <p className="banner">No walkthrough is saved in this browser. Measure a room, or open the recorded preview on Measure. Nothing was filled in.</p>}
      {snapshot?.source === "recorded-preview" && <p className="banner">Recorded preview. Not a customer recording.</p>}
      {step === "Capture" && (
        <section className="phone">
          <div className="phone-top"><span>{snapshot ? "Saved" : "Empty"}</span><span>Transcript</span></div>
          <p>{snapshot?.transcript ?? "No transcript yet."}</p>
          <p className="meta">{snapshot?.transcriptNote ?? "A spoken length stays provisional until it is locked on the plan."}</p>
          <a className="btn" href="/measure">Open guided capture</a>
        </section>
      )}
      {step === "Gaps" && (
        <section className="panel">
          <p className="kicker">{gaps.length ? `${gaps.length} open` : "No open measurements"} before this goes further</p>
          {gaps.length === 0 && <p className="meta">Nothing unmeasured was found on the saved plan.</p>}
          {gaps.map((gap) => <p key={gap}>{gap}</p>)}
        </section>
      )}
      {step === "Review" && snapshot && (
        <PlanView plan={snapshot.plan} onChange={(plan) => {
          const next = { ...snapshot, plan };
          setSnapshot(next);
          saveWalkthrough(next);
        }} />
      )}
      {step === "Draft estimate" && snapshot && <ResultsView plan={snapshot.plan} objects={snapshot.objects} offers={snapshot.offers} />}
      <section className="panel">
        <p className="kicker">Synthetic harness, not this walkthrough</p>
        <p className="meta">These rows are the ChArUco solve on rendered rooms. A miss is not shown as confirmed.</p>
        <table>
          <thead><tr><th>Truth</th><th>Solved</th><th>Actual error</th><th>Bound</th><th></th></tr></thead>
          <tbody>
            {walls.map((row) => (
              <tr key={`${row.truthFt}-${row.valueFt}`}>
                <td>{row.truthFt} ft</td>
                <td>{row.valueFt ?? "?"} ft</td>
                <td>{row.actualPercent == null ? "?" : `${row.actualPercent}%`}</td>
                <td>{row.errorPercent == null ? "?" : `±${row.errorPercent}%`}</td>
                <td>{row.meetsAccuracyTarget ? <span className="chip blue">Meets ±5%</span> : <span className="chip orange">Does not meet ±5%</span>}</td>
              </tr>
            ))}
            {height && (
              <tr>
                <td>Ceiling {height.truthFt} ft</td>
                <td>{height.valueFt == null ? "?" : `${height.valueFt} ft`}</td>
                <td>{height.actualPercent == null ? "?" : `${height.actualPercent}%`}</td>
                <td>{height.errorPercent == null ? "?" : `±${height.errorPercent}%`}</td>
                <td>{height.meetsAccuracyTarget ? <span className="chip blue">Meets ±5%</span> : <span className="chip orange">Does not meet ±5%</span>}</td>
              </tr>
            )}
          </tbody>
        </table>
        <a className="btn secondary" href="/account">Sign in to approve or authorize a job</a>
      </section>
    </div>
  );
}
