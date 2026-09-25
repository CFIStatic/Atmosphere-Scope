"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { loadWalkthrough, saveWalkthrough, type WalkthroughSnapshot } from "@/capture/snapshot";
import { CommandBar } from "@/components/command-bar";
import { Amount } from "@/components/amount";
import { acceptItems, buildReview, confidentIds, skipFollowUp, type ReviewItem } from "@/domain/assist";
import { formatPct, formatQty } from "@/domain/format";
import { priceChip } from "@/domain/labels";

export function ReviewScreen() {
  const [snapshot, setSnapshot] = useState<WalkthroughSnapshot | null>(null);
  const [ready, setReady] = useState(false);
  useEffect(() => {
    setSnapshot(loadWalkthrough());
    setReady(true);
  }, []);

  if (!ready) {
    return (
      <div className="grid" aria-hidden="true">
        <div className="skeleton" />
        <div className="skeleton" />
        <div className="skeleton" />
      </div>
    );
  }
  if (!snapshot) {
    return (
      <div className="empty">
        <p>No walkthrough.</p>
        <Link className="btn" href="/walk">Walk</Link>
      </div>
    );
  }

  const review = buildReview(snapshot);
  const confident = confidentIds(snapshot);
  const priced = review.items.filter((item) => item.price != null).length;
  const pricedPct = review.items.length ? (priced / review.items.length) * 100 : null;
  const total = priced === review.items.length && review.items.length
    ? review.items.reduce((sum, item) => sum + (item.price ?? 0) * (item.quantity ?? 1), 0)
    : null;
  const width = snapshot.plan.edges.find((edge) => edge.label === "span_a" || edge.label === "width")?.valueFt;
  const depth = snapshot.plan.edges.find((edge) => edge.label === "span_b" || edge.label === "depth")?.valueFt;
  const area = width != null && depth != null ? width * depth : null;

  function save(next: WalkthroughSnapshot) {
    saveWalkthrough(next);
    setSnapshot(next);
  }

  return (
    <div className="grid">
      <div className="kpi" aria-label="Review summary">
        <div><span>Total</span><strong><Amount value={total} /></strong></div>
        <div><span>Priced</span><strong>{pricedPct == null ? "—" : formatPct(pricedPct)}</strong></div>
        <div><span>Items</span><strong>{review.items.length}</strong></div>
        <div><span>Needs attention</span><strong>{review.needsYou.length}</strong></div>
        <div><span>Area</span><strong>{area == null ? "—" : `${formatQty(area)} sf`}</strong></div>
      </div>
      {review.dimensions.length > 0 && (
        <div className="row">
          {review.dimensions.map((item) => (
            <span key={item.label} className="tag">{item.label} {item.confidence}</span>
          ))}
        </div>
      )}
      {review.followUps.length > 0 && (
        <section className="grid">
          <h2>Follow-up</h2>
          {review.followUps.map((item, index) => {
            const primary = confident.length === 0 && index === 0 ? "btn" : "btn secondary";
            return (
              <div key={item.id} className="job-row">
                <span>{item.text}</span>
                {item.action === "rerecord" && <Link className={primary} href="/walk">Record</Link>}
                {item.action === "answer" && <button className={primary} type="button" onClick={() => document.querySelector<HTMLInputElement>("[aria-label='Instruction']")?.focus()}>Answer</button>}
                {item.action === "skip" && <button className={primary} type="button" onClick={() => save(skipFollowUp(snapshot, item.id))}>Skip</button>}
              </div>
            );
          })}
        </section>
      )}
      <section className="grid">
        <div className="row">
          <h2>Needs review</h2>
          {confident.length > 0 && <button className="btn" type="button" onClick={() => save(acceptItems(snapshot, confident, "You", new Date().toISOString()))}>Accept confident</button>}
        </div>
        {review.needsYou.length === 0 && <p className="meta">None.</p>}
        {review.needsYou.length > 0 && <ItemTable items={review.needsYou} onAccept={(id) => save(acceptItems(snapshot, [id], "You", new Date().toISOString()))} />}
      </section>
      <section className="grid">
        <h2>Accepted</h2>
        {review.looksGood.length === 0 && <p className="meta">None.</p>}
        {review.looksGood.length > 0 && <ItemTable items={review.looksGood} />}
      </section>
      <CommandBar snapshot={snapshot} onSnapshot={save} />
      <p className="meta"><Link href="/estimate">Estimate</Link></p>
    </div>
  );
}

function ItemTable({ items, onAccept }: { items: ReviewItem[]; onAccept?: (id: string) => void }) {
  return (
    <table className="data">
      <thead>
        <tr>
          <th>Item</th>
          <th className="num">Qty</th>
          <th>Unit</th>
          <th className="num">Amount</th>
          <th>Status</th>
          {onAccept && <th></th>}
        </tr>
      </thead>
      <tbody>
        {items.map((item) => (
          <tr key={item.id}>
            <td data-label="Item">{item.name}</td>
            <td className="num" data-label="Qty">{item.quantity == null ? "—" : formatQty(item.quantity)}</td>
            <td data-label="Unit">{item.unit}</td>
            <td className="num" data-label="Amount"><Amount value={item.price == null ? null : item.price * (item.quantity ?? 1)} /></td>
            <td data-label="Status"><span className="tag">{item.confidence}</span> <span className="tag">{priceChip(item.priceStatus)}</span></td>
            {onAccept && <td data-label=""><button className="btn secondary" type="button" onClick={() => onAccept(item.id)}>Accept</button></td>}
          </tr>
        ))}
      </tbody>
    </table>
  );
}
