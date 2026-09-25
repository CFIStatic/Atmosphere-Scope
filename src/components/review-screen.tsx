"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { loadWalkthrough, saveWalkthrough, type WalkthroughSnapshot } from "@/capture/snapshot";
import { CommandBar } from "@/components/command-bar";
import { acceptItems, buildReview, confidentIds, skipFollowUp, type ReviewItem } from "@/domain/assist";
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
        <p>Walk a room to draft a job.</p>
        <Link className="btn" href="/walk">Walk</Link>
      </div>
    );
  }

  const review = buildReview(snapshot);
  const confident = confidentIds(snapshot);

  function save(next: WalkthroughSnapshot) {
    saveWalkthrough(next);
    setSnapshot(next);
  }

  return (
    <div className="grid">
      <p className="review-summary">{review.summary}</p>
      {review.dimensions.length > 0 && (
        <div className="row">
          {review.dimensions.map((item) => (
            <span key={item.label} className={chipClass(item.confidence)}>{item.label} · {item.confidence}</span>
          ))}
        </div>
      )}
      {review.followUps.length > 0 && (
        <section className="grid">
          <h2>Follow-ups</h2>
          {review.followUps.map((item, index) => {
            const primary = confident.length === 0 && index === 0 ? "btn" : "btn secondary";
            return (
              <div key={item.id} className="job-row">
                <span>{item.text}</span>
                {item.action === "rerecord" && <Link className={primary} href="/walk">Record</Link>}
                {item.action === "answer" && <button className={primary} type="button" onClick={() => document.querySelector<HTMLInputElement>("[aria-label='Ask or tell Atmosphere']")?.focus()}>Answer</button>}
                {item.action === "skip" && <button className={primary} type="button" onClick={() => save(skipFollowUp(snapshot, item.id))}>Skip</button>}
              </div>
            );
          })}
        </section>
      )}
      <section className="grid">
        <div className="row">
          <h2>Needs you</h2>
          {confident.length > 0 && <button className="btn" type="button" onClick={() => save(acceptItems(snapshot, confident, "You", new Date().toISOString()))}>Accept all confident items</button>}
        </div>
        {review.needsYou.length === 0 && <p className="meta">Nothing is waiting.</p>}
        {review.needsYou.map((item) => <ItemCard key={item.id} item={item} onAccept={() => save(acceptItems(snapshot, [item.id], "You", new Date().toISOString()))} />)}
      </section>
      <section className="grid">
        <h2>Looks good</h2>
        {review.looksGood.length === 0 && <p className="meta">Nothing accepted yet.</p>}
        {review.looksGood.map((item) => <ItemCard key={item.id} item={item} />)}
      </section>
      <CommandBar snapshot={snapshot} onSnapshot={save} />
      <p className="meta"><Link href="/estimate">Estimate</Link></p>
    </div>
  );
}

function ItemCard({ item, onAccept }: { item: ReviewItem; onAccept?: () => void }) {
  return (
    <article className="item-card">
      <div className="item-card-top">
        <strong>{item.name}</strong>
        <span className={chipClass(item.confidence)}>{item.confidence}</span>
      </div>
      <p className="meta">{item.room} · {item.quantity == null ? "Quantity —" : `${item.quantity} ${item.unit}`}</p>
      <p>{priceLabel(item)} <span className={item.priceStatus === "verified" ? "chip blue" : item.priceStatus === "unpriced" ? "chip" : "chip orange"}>{priceChip(item.priceStatus)}</span></p>
      {onAccept && <button className="btn secondary" type="button" onClick={onAccept}>Accept</button>}
    </article>
  );
}

function priceLabel(item: ReviewItem): string {
  return item.price == null ? "Price —" : `$${item.price}`;
}

function chipClass(confidence: ReviewItem["confidence"]): string {
  if (confidence === "High") return "chip blue";
  if (confidence === "Low") return "chip orange";
  return "chip";
}
