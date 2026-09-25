"use client";

import { useEffect, useState } from "react";
import { gapsFromSnapshot, loadWalkthrough, saveWalkthrough, type WalkthroughSnapshot } from "@/capture/snapshot";
import { DraftEstimate } from "@/components/draft-estimate";
import { PlanView } from "@/components/plan-view";

const STEPS = ["Check", "Sketch", "Estimate"] as const;

export function ClaimsFlow() {
  const [step, setStep] = useState<(typeof STEPS)[number]>("Estimate");
  const [snapshot, setSnapshot] = useState<WalkthroughSnapshot | null>(null);
  const [ready, setReady] = useState(false);
  useEffect(() => {
    const saved = loadWalkthrough();
    setSnapshot(saved);
    setStep(saved ? "Estimate" : "Check");
    setReady(true);
  }, []);
  const gaps = snapshot ? gapsFromSnapshot(snapshot) : [];

  if (!ready) return null;
  if (!snapshot) {
    return (
      <div className="empty">
        <p>No walkthrough.</p>
        <a className="btn" href="/walk">Walk</a>
      </div>
    );
  }

  return (
    <div className="flow">
      {snapshot.source === "recorded-preview" && <p className="meta">Sample. Not a customer recording.</p>}
      <div className="tabs" role="tablist">
        {STEPS.map((item) => (
          <button key={item} type="button" role="tab" aria-selected={step === item} onClick={() => setStep(item)}>{item}</button>
        ))}
      </div>
      {step === "Check" && (
        <section className="grid">
          <p>{snapshot.transcript ?? "No transcript yet."}</p>
          {gaps.length === 0 ? <p className="meta">No open measurements.</p> : gaps.map((gap) => <p key={gap}>{gap}</p>)}
        </section>
      )}
      {step === "Sketch" && (
        <PlanView plan={snapshot.plan} onChange={(plan) => {
          const next = { ...snapshot, plan };
          setSnapshot(next);
          saveWalkthrough(next);
        }} />
      )}
      {step === "Estimate" && (
        <DraftEstimate snapshot={snapshot} onSnapshot={(next) => { setSnapshot(next); saveWalkthrough(next); }} />
      )}
    </div>
  );
}
