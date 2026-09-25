"use client";

import { useMemo, useState, Fragment } from "react";
import { inventoryFromWalkthrough } from "@/analysis/inventory";
import type { IdentifiedObject } from "@/analysis/frames";
import type { FloorPlan } from "@/domain/plan-from-measurement";
import { priceChip } from "@/domain/labels";
import { formatQty } from "@/domain/format";
import { Amount } from "@/components/amount";
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
      <table className="data">
        <thead>
          <tr>
            <th>Item</th>
            <th className="num">Qty</th>
            <th>Unit</th>
            <th className="num">Amount</th>
            <th>Status</th>
            <th></th>
          </tr>
        </thead>
        <tbody>
          {rooms.map((room) => {
            const roomLines = lines.filter((line) => line.room === room);
            const roomTotal = totals.rooms.find((item) => item.room === room);
            return (
              <Fragment key={room}>
                <tr>
                  <td colSpan={6} data-label="Room">{room}</td>
                </tr>
                {roomLines.map((line) => {
                  const choice = line.replacements[line.selected];
                  const verified = choice?.status === "verified";
                  return (
                    <tr key={line.id}>
                      <td data-label="Item">{line.item}</td>
                      <td className="num" data-label="Qty">{line.quantity == null ? "—" : formatQty(line.quantity)}</td>
                      <td data-label="Unit">{line.unit}</td>
                      <td className="num" data-label="Amount"><Amount value={line.lineTotal} /></td>
                      <td data-label="Status"><span className="tag">{priceChip(verified ? "verified" : choice?.unitPrice == null ? "unpriced" : "unverified")}</span></td>
                      <td data-label=""><button className="btn secondary" type="button" onClick={() => setEditingId(line.id)}>Edit</button></td>
                    </tr>
                  );
                })}
                <tr className="subtotal">
                  <td colSpan={3} data-label="Subtotal">{room}</td>
                  <td className="num" data-label="Amount"><Amount value={roomTotal?.unverified ? null : roomTotal?.total ?? null} /></td>
                  <td colSpan={2}></td>
                </tr>
              </Fragment>
            );
          })}
          <tr className="grand">
            <td colSpan={3} data-label="Total">Total</td>
            <td className="num" data-label="Amount"><Amount value={totals.rooms.some((room) => room.unverified) ? null : totals.job} /></td>
            <td colSpan={2} data-label="Status"><span className="tag">{totals.rooms.some((room) => room.unverified) || totals.job == null ? "Not verified" : "Verified"}</span></td>
          </tr>
        </tbody>
      </table>
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
        <h2>{line.item}</h2>
        <p className="meta">A blank price stays unpriced.</p>
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
