"use client";

import { useMemo, useState } from "react";
import { inventoryFromWalkthrough } from "@/analysis/inventory";
import type { IdentifiedObject } from "@/analysis/frames";
import type { FloorPlan } from "@/domain/plan-from-measurement";
import { buildResultLines, chooseReplacement, overrideReplacement, resultTotals, type ResultOffer } from "@/domain/results";

export function ResultsView({ plan, objects, offers }: { plan: FloorPlan; objects: IdentifiedObject[]; offers: ResultOffer[] }) {
  const built = useMemo(() => buildResultLines(inventoryFromWalkthrough(objects, plan), offers), [plan, objects, offers]);
  const [picks, setPicks] = useState<Record<string, number>>({});
  const [manuals, setManuals] = useState<Record<string, { title: string; unitPrice: number | null }>>({});
  const lines = useMemo(() => {
    let next = built;
    for (const [id, index] of Object.entries(picks)) next = chooseReplacement(next, id, index);
    for (const [id, entry] of Object.entries(manuals)) next = overrideReplacement(next, id, entry);
    return next;
  }, [built, picks, manuals]);
  const totals = resultTotals(lines);
  const rooms = [...new Set(lines.map((line) => line.room))];

  return (
    <div className="grid">
      {rooms.map((room) => (
        <section key={room}>
          <p className="kicker">{room}</p>
          <table>
            <thead>
              <tr><th>Item</th><th>Qty</th><th>Evidence</th><th>Replacement</th><th>Unit price</th><th>Line</th></tr>
            </thead>
            <tbody>
              {lines.filter((line) => line.room === room).map((line) => {
                const choice = line.replacements[line.selected];
                return (
                  <tr key={line.id}>
                    <td>{line.item}</td>
                    <td>{line.quantity == null ? "—" : `${line.quantity} ${line.unit}`}</td>
                    <td>{line.evidence}{line.links[0] ? <span className="meta"> {line.links[0].frame}{line.links[0].timeMs == null ? "" : ` @ ${(line.links[0].timeMs / 1000).toFixed(1)}s`}</span> : null}</td>
                    <td>
                      {choice?.title ?? "—"}{choice?.retailer ? ` · ${choice.retailer}` : ""}
                      {choice?.url ? <> · <a href={choice.url}>{choice.url}</a></> : null}
                      <div className="meta">{choice?.note}</div>
                      <div className="row">
                        {choice?.status === "verified" ? <span className="chip blue">Verified</span> : choice?.status === "manual" ? <span className="chip orange">Manual</span> : choice?.status === "unverified" ? <span className="chip orange">Unverified</span> : <span className="chip">Unpriced</span>}
                        {line.replacements.length > 1 && <button className="btn secondary" type="button" onClick={() => setPicks((current) => ({ ...current, [line.id]: ((current[line.id] ?? line.selected) + 1) % line.replacements.length }))}>Another match</button>}
                      </div>
                      <form className="row" onSubmit={(event) => {
                        event.preventDefault();
                        const form = new FormData(event.currentTarget);
                        const raw = String(form.get("price") ?? "");
                        const unitPrice = raw.trim() === "" ? null : Number(raw);
                        if (unitPrice != null && !Number.isFinite(unitPrice)) return;
                        setManuals((current) => ({ ...current, [line.id]: { title: String(form.get("title") ?? ""), unitPrice } }));
                      }}>
                        <input name="title" aria-label={`Replacement for ${line.item}`} placeholder="Hand-entered replacement" />
                        <input name="price" aria-label={`Unit price for ${line.item}`} inputMode="decimal" placeholder="Unit price" />
                        <button className="btn secondary" type="submit">Use this price</button>
                      </form>
                    </td>
                    <td>{choice?.unitPrice == null ? "—" : `${choice.currency ?? ""} ${choice.unitPrice}`.trim()} {choice?.status === "verified" ? <span className="chip blue">Verified</span> : choice?.unitPrice != null ? <span className="chip orange">Not verified</span> : null}</td>
                    <td>{line.lineTotal == null ? "—" : line.lineTotal}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
          <p className="meta">Room total {totals.rooms.find((item) => item.room === room)?.total ?? "—"}{totals.rooms.find((item) => item.room === room)?.unverified ? " · includes an unverified price" : ""}</p>
        </section>
      ))}
      <p className="banner">{totals.job == null ? totals.note : `Job total ${totals.job}. ${totals.note}`}</p>
    </div>
  );
}
