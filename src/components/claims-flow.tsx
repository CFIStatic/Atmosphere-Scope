"use client";

import { useMemo, useState } from "react";
import { moistureReadingDoesNotSetArea, softFloorScope, wallFaceFromAnswers } from "@/domain/gap-answers";

type Row = {
  kind: string;
  truthFt: number;
  valueFt: number | null;
  actualPercent: number | null;
  errorPercent: number | null;
  meetsAccuracyTarget: boolean;
};

export function ClaimsFlow({ walls, height }: { walls: Row[]; height: Row | null }) {
  const [feet, setFeet] = useState("");
  const [inches, setInches] = useState("");
  const [moisture, setMoisture] = useState("");
  const [soft, setSoft] = useState<"confirmed" | "not_present" | "cant_tell" | "">("");
  const length = walls[0]?.valueFt ?? null;
  const typedHeight = useMemo(() => {
    const whole = Number(feet);
    const part = Number(inches || 0);
    if (!Number.isFinite(whole) || whole <= 0) return null;
    return whole + (Number.isFinite(part) ? part / 12 : 0);
  }, [feet, inches]);
  const face = wallFaceFromAnswers(length, typedHeight);
  const pin = moistureReadingDoesNotSetArea();
  const floor = soft ? softFloorScope(soft) : null;

  return (
    <div className="flow">
      <p className="kicker">Captured → Review → Draft estimate → Estimator approval → Customer authorization</p>
      <section className="split">
        <div className="phone">
          <div className="phone-top"><span>REC</span><span>KITCHEN</span></div>
          <div className="viewfinder">Fit the calibration sheet in the lower frame, then sweep the walls.</div>
          <p className="coach">Listening is narration, not a measurement. A spoken length stays provisional.</p>
          <div className="row">
            <span className="chip orange">Provisional</span>
            <span className="chip">Seen</span>
            <span className="chip">Said · homeowner</span>
          </div>
          <a className="btn" href="/measure">Open guided capture</a>
        </div>
        <section className="panel">
          <p className="kicker">3 gaps before this goes to the estimator</p>
          <label className="field">Kitchen wall height
            <span className="row">
              <input value={feet} onChange={(event) => setFeet(event.target.value)} inputMode="numeric" placeholder="ft" />
              <input value={inches} onChange={(event) => setInches(event.target.value)} inputMode="numeric" placeholder="in" />
            </span>
          </label>
          <p className="meta">
            Wall length from the sheet: {length == null ? "?" : `${length} ft`}.
            Face area: {face.valueSqFt == null ? "?" : `${face.valueSqFt} sq ft`} · {face.status}.
            {height && !height.meetsAccuracyTarget ? " The video ceiling did not meet ±5%, so this box is the tape, not a confirmation of the video." : ""}
          </p>
          <label className="field">Hallway moisture, pin %MC
            <input value={moisture} onChange={(event) => setMoisture(event.target.value)} inputMode="decimal" placeholder="%" />
          </label>
          <p className="meta">{moisture ? `Reading ${moisture} stored as a test, not as seen.` : "No reading yet."} {pin.note} Quantity: ?</p>
          <fieldset className="field">
            <legend>Soft floor</legend>
            <div className="row">
              {(["confirmed", "not_present", "cant_tell"] as const).map((option) => (
                <button key={option} type="button" className={soft === option ? "btn" : "btn secondary"} onClick={() => setSoft(option)}>
                  {option === "not_present" ? "Not present" : option === "cant_tell" ? "Can't tell" : "Confirmed"}
                </button>
              ))}
            </div>
          </fieldset>
          {floor && <p className="meta">{floor.note} Quantity: {floor.quantitySqFt == null ? "?" : floor.quantitySqFt}</p>}
        </section>
      </section>
      <section className="panel">
        <p className="kicker">Measured spans from the synthetic harness</p>
        <p className="meta">These numbers are the ChArUco solve on rendered rooms, not a customer tape. A value that misses the target is not shown as confirmed.</p>
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
        <p className="meta">Estimator approval still locks quantities in the job workspace. Customer authorization is a later step. This screen does not approve anything.</p>
        <a className="btn secondary" href="/jobs/new">Open a job workspace</a>
      </section>
    </div>
  );
}
