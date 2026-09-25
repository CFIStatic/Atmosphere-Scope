"use client";

import { useState } from "react";
import { dimensionLabel } from "@/domain/labels";
import type { FloorPlan } from "@/domain/plan-from-measurement";
import { verifyEdgeWithTape, verifyHeightWithTape } from "@/domain/tape";
import { formatQty } from "@/domain/format";

type Row = {
  key: string;
  label: string;
  valueFt: number | null;
  confirmed: boolean;
  kind: "edge" | "height";
  roomId: string;
  edgeIndex: number;
};

export function TapeVerify({ plan, onPlan }: { plan: FloorPlan; onPlan: (plan: FloorPlan) => void }) {
  const [open, setOpen] = useState<string | null>(null);
  const [feet, setFeet] = useState("");
  const [note, setNote] = useState<string | null>(null);
  const rows = rowsFrom(plan);
  if (rows.length === 0) return null;

  function lock(row: Row) {
    const tape = Number(feet);
    const result = row.kind === "height"
      ? verifyHeightWithTape(plan, row.roomId, tape)
      : verifyEdgeWithTape(plan, row.roomId, row.edgeIndex, tape);
    setNote(result.note);
    if (result.plan !== plan) onPlan(result.plan);
    setOpen(null);
    setFeet("");
  }

  return (
    <section className="grid">
      <h2>Dimensions</h2>
      <table className="data">
        <thead>
          <tr>
            <th>Dimension</th>
            <th className="num">Value</th>
            <th>Status</th>
            <th></th>
          </tr>
        </thead>
        <tbody>
          {rows.map((row) => (
            <tr key={row.key}>
              <td data-label="Dimension">{row.label}</td>
              <td className="num" data-label="Value">{row.valueFt == null ? "—" : `${formatQty(row.valueFt)} ft`}</td>
              <td data-label="Status">{row.confirmed ? "Verified" : "Not verified"}</td>
              <td data-label="">
                {open === row.key ? (
                  <form className="grid" onSubmit={(event) => { event.preventDefault(); lock(row); }}>
                    <label className="field">Feet
                      <input value={feet} onChange={(event) => setFeet(event.target.value)} inputMode="decimal" aria-label={`Tape for ${row.label}`} placeholder="14.0" />
                    </label>
                    <button className="btn secondary" type="submit">Lock</button>
                  </form>
                ) : (
                  <button className="btn secondary" type="button" onClick={() => { setOpen(row.key); setNote(null); setFeet(""); }}>Verify with a tape</button>
                )}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
      {note && <p className="meta">{note}</p>}
    </section>
  );
}

function edgeTitle(plan: FloorPlan, edge: FloorPlan["edges"][number]): string {
  const room = plan.names[edge.roomId] ?? "Room";
  if (/^(span_a|span_b|width|depth|height|area|floor_area)$/i.test(edge.label)) return `${room} ${dimensionLabel(edge.label)}`;
  return `${room} wall ${edge.edgeIndex + 1}`;
}

function rowsFrom(plan: FloorPlan): Row[] {
  const edges = plan.edges.map((edge) => ({
    key: `edge:${edge.roomId}:${edge.edgeIndex}`,
    label: edgeTitle(plan, edge),
    valueFt: edge.valueFt,
    confirmed: edge.status === "confirmed",
    kind: "edge" as const,
    roomId: edge.roomId,
    edgeIndex: edge.edgeIndex,
  }));
  const heights = Object.entries(plan.ceilingHeights).map(([roomId, height]) => ({
    key: `height:${roomId}`,
    label: `${plan.names[roomId] ?? "Room"} height`,
    valueFt: height.valueFt,
    confirmed: height.status === "confirmed",
    kind: "height" as const,
    roomId,
    edgeIndex: 0,
  }));
  return [...edges, ...heights];
}
