"use client";

import { useMemo, useState } from "react";
import { inventoryFromWalkthrough } from "@/analysis/inventory";
import type { IdentifiedObject } from "@/analysis/frames";
import type { FloorPlan } from "@/domain/plan-from-measurement";
import { buildResultLines, chooseReplacement, overrideQuantity, overrideReplacement, resultTotals, withManualOffer, withObjectQuantity, withSelectedOffer, type ResultLine, type ResultOffer } from "@/domain/results";

export function ResultsView({ plan, objects, offers, onChange }: {
  plan: FloorPlan;
  objects: IdentifiedObject[];
  offers: ResultOffer[];
  onChange?: (next: { offers: ResultOffer[]; objects: IdentifiedObject[] }) => void;
}) {
  const built = useMemo(() => buildResultLines(inventoryFromWalkthrough(objects, plan), offers), [plan, objects, offers]);
  const [picks, setPicks] = useState<Record<string, number>>({});
  const [manuals, setManuals] = useState<Record<string, { title: string; unitPrice: number | null }>>({});
  const [quantities, setQuantities] = useState<Record<string, number | null>>({});
  const [editingId, setEditingId] = useState<string | null>(null);
  const lines = useMemo(() => {
    let next = built;
    for (const [id, quantity] of Object.entries(quantities)) next = overrideQuantity(next, id, quantity);
    for (const [id, index] of Object.entries(picks)) next = chooseReplacement(next, id, index);
    for (const [id, entry] of Object.entries(manuals)) next = overrideReplacement(next, id, entry);
    return next;
  }, [built, picks, manuals, quantities]);
  const totals = resultTotals(lines);
  const rooms = [...new Set(lines.map((line) => line.room))];
  const editing = lines.find((line) => line.id === editingId) ?? null;

  return (
    <div className="grid">
      {rooms.map((room) => (
        <section key={room} className="grid">
          <p className="kicker">{room}</p>
          {lines.filter((line) => line.room === room).map((line) => {
            const choice = line.replacements[line.selected];
            const verified = choice?.status === "verified";
            return (
              <article key={line.id} className="item-card">
                <div className="item-card-top">
                  <strong>{line.item}</strong>
                  {verified ? <span className="chip blue">Verified</span> : choice?.unitPrice == null ? <span className="chip">Unpriced</span> : <span className="chip orange">Not verified</span>}
                </div>
                <p className="item-card-qty">{line.quantity == null ? "Quantity —" : `${line.quantity} ${line.unit}`}</p>
                <p className="item-card-price">{choice?.unitPrice == null ? "Price —" : `${choice.currency ?? "USD"} ${choice.unitPrice}`}</p>
                <p className="meta">{line.lineTotal == null ? "Line —" : `Line ${line.lineTotal}`} · {choice?.title ?? "No replacement"}{choice?.retailer ? ` · ${choice.retailer}` : ""}</p>
                <p className="meta">{line.evidence}{line.links[0] ? ` · ${line.links[0].frame}${line.links[0].timeMs == null ? "" : ` @ ${(line.links[0].timeMs / 1000).toFixed(1)}s`}` : ""}</p>
                <button className="btn secondary" type="button" onClick={() => setEditingId(line.id)}>Edit</button>
              </article>
            );
          })}
          <p className="meta">Room total {totals.rooms.find((item) => item.room === room)?.total ?? "—"}{totals.rooms.find((item) => item.room === room)?.unverified ? " · includes an unverified price" : ""}</p>
        </section>
      ))}
      <p className="banner">{totals.job == null ? totals.note : `Job total ${totals.job}. ${totals.note}`}</p>
      {editing && <EditSheet line={editing} onClose={() => setEditingId(null)} onAnother={() => {
        const nextIndex = ((picks[editing.id] ?? editing.selected) + 1) % editing.replacements.length;
        const choice = editing.replacements[nextIndex];
        setPicks((current) => ({ ...current, [editing.id]: nextIndex }));
        if (choice) onChange?.({ offers: withSelectedOffer(offers, editing.item, { title: choice.title, unitPrice: choice.unitPrice }), objects });
      }} onSave={(entry) => {
        setQuantities((current) => ({ ...current, [editing.id]: entry.quantity }));
        setManuals((current) => ({ ...current, [editing.id]: { title: entry.title, unitPrice: entry.unitPrice } }));
        onChange?.({
          offers: withManualOffer(offers, editing.item, { title: entry.title, unitPrice: entry.unitPrice }),
          objects: withObjectQuantity(objects, editing.room, editing.item, entry.quantity),
        });
        setEditingId(null);
      }} />}
    </div>
  );
}

function EditSheet({ line, onClose, onAnother, onSave }: {
  line: ResultLine;
  onClose: () => void;
  onAnother: () => void;
  onSave: (entry: { title: string; unitPrice: number | null; quantity: number | null }) => void;
}) {
  const choice = line.replacements[line.selected];
  return (
    <div className="sheet-backdrop" onClick={onClose}>
      <form className="sheet" role="dialog" aria-modal="true" aria-label={`Edit ${line.item}`} onClick={(event) => event.stopPropagation()} onSubmit={(event) => {
        event.preventDefault();
        const form = new FormData(event.currentTarget);
        const priceRaw = String(form.get("price") ?? "");
        const quantityRaw = String(form.get("quantity") ?? "");
        const unitPrice = priceRaw.trim() === "" ? null : Number(priceRaw);
        const quantity = quantityRaw.trim() === "" ? null : Number(quantityRaw);
        if (unitPrice != null && !Number.isFinite(unitPrice)) return;
        if (quantity != null && !Number.isFinite(quantity)) return;
        onSave({ title: String(form.get("title") ?? ""), unitPrice, quantity });
      }}>
        <p className="kicker">Edit item</p>
        <h2>{line.item}</h2>
        <p className="meta">A blank price stays unpriced. This quantity is for the list. It does not redraw the sketch.</p>
        <label className="field">Quantity
          <input name="quantity" inputMode="decimal" defaultValue={line.quantity ?? ""} aria-label={`Quantity for ${line.item}`} />
        </label>
        <label className="field">Replacement
          <input name="title" defaultValue={choice?.title ?? ""} aria-label={`Replacement for ${line.item}`} placeholder="Hand-entered replacement" />
        </label>
        <label className="field">Unit price
          <input name="price" inputMode="decimal" defaultValue={choice?.unitPrice ?? ""} aria-label={`Unit price for ${line.item}`} placeholder="Unit price" />
        </label>
        {line.replacements.length > 1 && <button className="btn secondary" type="button" onClick={onAnother}>Another match</button>}
        <div className="action-bar">
          <button className="btn secondary" type="button" onClick={onClose}>Cancel</button>
          <button className="btn" type="submit">Save</button>
        </div>
      </form>
    </div>
  );
}
