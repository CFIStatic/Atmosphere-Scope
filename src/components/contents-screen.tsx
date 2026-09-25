"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { loadWalkthrough, saveWalkthrough, type WalkthroughSnapshot } from "@/capture/snapshot";
import { FieldPair } from "@/components/field-pair";
import { PlanView } from "@/components/plan-view";
import { ResultsView } from "@/components/results-view";
import { crossCheckPlans, importFloorPlan } from "@/import/floor-plan";

export function ContentsScreen() {
  const [snapshot, setSnapshot] = useState<WalkthroughSnapshot | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [unit, setUnit] = useState<"" | "ft" | "in" | "m">("");
  const [feetPerUnit, setFeetPerUnit] = useState("");
  useEffect(() => setSnapshot(loadWalkthrough()), []);

  return (
    <div className="grid">
      <details className="quiet">
        <summary>Import a plan</summary>
        <p className="meta">CSV, DXF, SVG, or Hover JSON.</p>
        <form className="row" onSubmit={async (event) => {
          event.preventDefault();
          setError(null);
          const form = new FormData(event.currentTarget);
          const file = form.get("file");
          if (!(file instanceof File) || !file.size) {
            setError("Choose a file.");
            return;
          }
          try {
            const imported = importFloorPlan({
              filename: file.name,
              text: await file.text(),
              unit,
              feetPerUnit: feetPerUnit.trim() === "" ? null : Number(feetPerUnit),
            });
            const existing = loadWalkthrough();
            const video = existing?.videoPlan ?? (existing?.source === "measurement" ? existing.plan : null);
            const next: WalkthroughSnapshot = {
              savedAt: new Date().toISOString(),
              source: video ? "measurement" : "import",
              transcript: existing?.transcript ?? null,
              transcriptNote: existing?.transcriptNote ?? "Imported plan. No narration was attached.",
              plan: imported.plan,
              videoPlan: video,
              importNotes: imported.notes,
              crossCheck: video ? crossCheckPlans(imported.plan, video) : [],
              objects: existing?.objects ?? [],
              offers: existing?.offers ?? [],
            };
            saveWalkthrough(next);
            setSnapshot(next);
          } catch (caught) {
            setError(caught instanceof Error ? caught.message : "The file could not be imported.");
          }
        }}>
          <input name="file" type="file" accept=".csv,.dxf,.svg,.json,text/csv,image/svg+xml,application/json" aria-label="Floor plan file" />
          <label className="field">DXF unit if the file does not say
            <select value={unit} onChange={(event) => setUnit(event.target.value as "" | "ft" | "in" | "m")}>
              <option value="">Use $INSUNITS</option>
              <option value="ft">Feet</option>
              <option value="in">Inches</option>
              <option value="m">Meters</option>
            </select>
          </label>
          <label className="field">SVG, feet per drawing unit
            <input value={feetPerUnit} onChange={(event) => setFeetPerUnit(event.target.value)} inputMode="decimal" placeholder="1" />
          </label>
          <button className="btn secondary" type="submit">Import</button>
        </form>
        {error && <p className="error">{error}</p>}
      </details>
      {!snapshot && (
        <div className="empty">
          <p>No walkthrough.</p>
          <Link className="btn" href="/record">Record</Link>
        </div>
      )}
      {snapshot?.importNotes?.map((note) => <p key={note} className="meta">{note}</p>)}
      {snapshot?.crossCheck && snapshot.crossCheck.length > 0 && (
        <section className="panel">
          <p className="meta">Video comparison</p>
          <table className="stack">
            <thead><tr><th>Room</th><th>Item</th><th>Imported</th><th>Video</th><th></th></tr></thead>
            <tbody>
              {snapshot.crossCheck.map((row) => (
                <tr key={`${row.room}-${row.item}`}>
                  <td data-label="Room">{row.room}</td>
                  <td data-label="Item">{row.item}</td>
                  <td data-label="Imported">{row.imported ?? "—"}</td>
                  <td data-label="Video">{row.video ?? "—"}</td>
                  <td data-label="Note">{row.note}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </section>
      )}
      {snapshot && (
        <FieldPair
          sketch={<PlanView plan={snapshot.plan} onChange={(plan) => {
            const next = { ...snapshot, plan };
            setSnapshot(next);
            saveWalkthrough(next);
          }} />}
          items={<ResultsView plan={snapshot.plan} objects={snapshot.objects} offers={snapshot.offers} onChange={({ offers, objects }) => {
            const next = { ...snapshot, offers, objects };
            setSnapshot(next);
            saveWalkthrough(next);
          }} />}
        />
      )}
    </div>
  );
}
