"use client";

import { useMemo, useState } from "react";
import { boundsOf, edgeLength } from "@/domain/geometry";
import type { Job } from "@/domain/types";
import type { SketchOp } from "@/domain/sketch-ops";

export function SketchEditor({ job, onOp, onUndo, onRedo, onAddRoom }: { job: Job; onOp: (op: SketchOp) => void; onUndo: () => void; onRedo: () => void; onAddRoom: (name: string) => void }) {
  const [selected, setSelected] = useState<string | null>(job.sketch.geometry.rooms[0]?.roomId ?? null);
  const [overlay, setOverlay] = useState<"measurement" | "damage" | "scope">("measurement");
  const box = useMemo(() => boundsOf(job.sketch.geometry.rooms), [job.sketch]);
  const pad = 2;
  const view = `${box.minX - pad} ${box.minY - pad} ${Math.max(12, box.maxX - box.minX + pad * 2)} ${Math.max(10, box.maxY - box.minY + pad * 2)}`;
  const room = job.sketch.geometry.rooms.find((item) => item.roomId === selected);
  const record = job.rooms.find((item) => item.id === selected);

  return (
    <div className="split">
      <div>
        <div className="row" style={{ marginBottom: 8 }}>
          <button className="btn-secondary" type="button" onClick={onUndo}>Undo</button>
          <button className="btn-secondary" type="button" onClick={onRedo}>Redo</button>
          {(["measurement", "damage", "scope"] as const).map((mode) => (
            <button key={mode} className={overlay === mode ? "btn" : "btn-secondary"} type="button" onClick={() => setOverlay(mode)}>{mode}</button>
          ))}
        </div>
        <p className="legend meta">
          <i /> confirmed locked edge · <i className="dashed" /> inferred or narrated · <i className="dotted" /> conflicting
        </p>
        <div className="sketch-wrap">
          <svg viewBox={view} role="img" aria-label="Editable plan sketch, not a survey">
            <rect x={box.minX - pad} y={box.minY - pad} width={Math.max(12, box.maxX - box.minX + pad * 2)} height={Math.max(10, box.maxY - box.minY + pad * 2)} fill="#fbfaf6" />
            {job.sketch.geometry.rooms.map((item) => {
              const name = job.rooms.find((entry) => entry.id === item.roomId)?.name ?? "Room";
              const dash = item.provenance === "confirmed" ? undefined : item.incomplete ? "0.12 0.12" : "0.35 0.18";
              const cx = item.polygon.reduce((sum, point) => sum + point.x, 0) / item.polygon.length;
              const cy = item.polygon.reduce((sum, point) => sum + point.y, 0) / item.polygon.length;
              return (
                <g key={item.id} onClick={() => setSelected(item.roomId)}>
                  <polygon points={item.polygon.map((point) => `${point.x},${point.y}`).join(" ")} fill={selected === item.roomId ? "#e7f0ee" : "#f3ecdf"} stroke="#1c1915" strokeWidth={0.08} strokeDasharray={dash} />
                  <text x={cx} y={cy} fontSize={0.45} textAnchor="middle">{name}</text>
                  {overlay === "measurement" && item.polygon.map((point, index) => {
                    const next = item.polygon[(index + 1) % item.polygon.length];
                    const dim = job.sketch.geometry.dimensions.find((entry) => entry.target.type === "edge" && entry.target.roomId === item.roomId && entry.target.edgeIndex === index);
                    const style = dim?.status === "confirmed" ? undefined : dim?.status === "conflicting" ? "0.08 0.08" : "0.2 0.12";
                    return (
                      <g key={index}>
                        <line x1={point.x} y1={point.y} x2={next.x} y2={next.y} stroke={dim?.status === "conflicting" ? "#8d2f2f" : "#1c1915"} strokeWidth={0.06} strokeDasharray={style} />
                        <text x={(point.x + next.x) / 2} y={(point.y + next.y) / 2 - 0.15} fontSize={0.32} textAnchor="middle">
                          {(dim?.valueFt ?? edgeLength(item.polygon, index)).toFixed(1)} ft {dim?.status ?? "inferred"}
                        </text>
                      </g>
                    );
                  })}
                </g>
              );
            })}
            {overlay === "damage" && job.sketch.geometry.annotations.map((note) => (
              <text key={note.id} x={note.at.x} y={note.at.y} fontSize={0.35}>{note.text}</text>
            ))}
            {overlay === "damage" && job.findings.filter((finding) => finding.evidenceClass === "observed_condition").map((finding) => {
              const host = job.sketch.geometry.rooms.find((item) => item.roomId === finding.roomId);
              if (!host) return null;
              const x = host.polygon.reduce((sum, point) => sum + point.x, 0) / host.polygon.length;
              const y = host.polygon.reduce((sum, point) => sum + point.y, 0) / host.polygon.length + 0.6;
              return <text key={finding.id} x={x} y={y} fontSize={0.3} textAnchor="middle">{finding.title}</text>;
            })}
            {overlay === "scope" && job.scopeItems.filter((item) => item.scopeClass === "supported").map((item) => {
              const host = job.sketch.geometry.rooms.find((room) => room.roomId === item.roomId);
              if (!host) return null;
              const x = host.polygon[0]?.x ?? 0;
              const y = host.polygon[0]?.y ?? 0;
              return <text key={item.id} x={x + 0.3} y={y + 0.8} fontSize={0.28}>{item.code}</text>;
            })}
          </svg>
        </div>
        <p className="meta">{job.sketch.disclaimer} State: {job.sketch.state.replaceAll("_", " ")}. {job.sketch.scaleClaim === "to_scale" ? "To scale." : "Not to scale."} {job.sketch.scaleClaimReason}</p>
      </div>
      <aside className="panel grid">
        <p className="kicker">{record?.name ?? "Select a room"}</p>
        {room && (
          <form
            className="grid"
            onSubmit={(event) => {
              event.preventDefault();
              const form = new FormData(event.currentTarget);
              const edgeIndex = Number(form.get("edgeIndex"));
              const lengthFt = Number(form.get("lengthFt"));
              if (!Number.isFinite(lengthFt) || lengthFt <= 0) return;
              onOp({ type: "set_edge", roomId: room.roomId, edgeIndex, lengthFt, lock: form.get("lock") === "on", sourceNote: "Entered in the sketch editor." });
            }}
          >
            <label className="field">Edge
              <select name="edgeIndex">{room.polygon.map((_, index) => <option key={index} value={index}>Edge {index + 1} · {edgeLength(room.polygon, index).toFixed(2)} ft drawn</option>)}</select>
            </label>
            <label className="field">Measured length (ft)<input name="lengthFt" type="number" step="0.01" min="0.1" required /></label>
            <label className="row"><input name="lock" type="checkbox" /> Lock as confirmed measurement</label>
            <button className="btn" type="submit">Apply length</button>
          </form>
        )}
        {room && (
          <form
            className="grid"
            onSubmit={(event) => {
              event.preventDefault();
              const form = new FormData(event.currentTarget);
              const raw = String(form.get("heightFt") ?? "");
              const value = raw === "" ? null : Number(raw);
              onOp({ type: "set_height", roomId: room.roomId, valueFt: value, lock: form.get("lock") === "on", sourceNote: "Ceiling height entered in the sketch editor." });
            }}
          >
            <label className="field">Ceiling height (ft)<input name="heightFt" type="number" step="0.01" min="0.1" placeholder="Leave blank if unknown" /></label>
            <label className="row"><input name="lock" type="checkbox" /> Lock height</label>
            <button className="btn-secondary" type="submit">Save height</button>
          </form>
        )}
        <form className="row" onSubmit={(event) => { event.preventDefault(); const name = String(new FormData(event.currentTarget).get("name") ?? ""); if (name.trim()) onAddRoom(name); }}>
          <input name="name" placeholder="New room name" aria-label="New room name" />
          <button className="btn-secondary" type="submit">Add room</button>
        </form>
        {room && (
          <div className="row">
            <button className="btn-secondary" type="button" onClick={() => onOp({ type: "move_room", roomId: room.roomId, dx: 1, dy: 0 })}>Nudge</button>
            <button className="btn-secondary" type="button" onClick={() => onOp({ type: "rotate_room", roomId: room.roomId, degrees: 15 })}>Rotate</button>
            <button className="btn-secondary" type="button" onClick={() => onOp({ type: "split_room", roomId: room.roomId, newRoomId: `split_${room.roomId}`, along: "x", ratio: 0.5 })}>Split</button>
            <button className="btn-secondary" type="button" onClick={() => onOp({ type: "add_opening", opening: { id: `opn_${Date.now()}`, roomId: room.roomId, edgeIndex: 0, kind: "door", offsetFt: 1, widthFt: null, heightFt: null, connectsToRoomId: null, connectionStatus: "unresolved", provenance: "user_corrected" } })}>Door</button>
            <button className="btn-secondary" type="button" onClick={() => onOp({ type: "add_opening", opening: { id: `opn_${Date.now()}`, roomId: room.roomId, edgeIndex: 0, kind: "window", offsetFt: 2, widthFt: null, heightFt: null, connectsToRoomId: null, connectionStatus: "none", provenance: "user_corrected" } })}>Window</button>
            <button className="btn-secondary" type="button" onClick={() => onOp({ type: "add_fixture", fixture: { id: `fix_${Date.now()}`, roomId: room.roomId, kind: "fixture", label: "Fixture", at: room.polygon[0], provenance: "user_corrected" } })}>Fixture</button>
          </div>
        )}
        {room && (
          <form className="grid" onSubmit={(event) => {
            event.preventDefault();
            const text = String(new FormData(event.currentTarget).get("note") ?? "");
            if (!text.trim()) return;
            onOp({ type: "annotate", roomId: room.roomId, findingId: null, text, at: room.polygon[0] });
          }}>
            <input name="note" placeholder="Annotate this room" aria-label="Room annotation" />
            <button className="btn-secondary" type="submit">Add note</button>
          </form>
        )}
        {job.sketch.geometry.openings.filter((opening) => opening.roomId === room?.roomId).map((opening) => (
          <form key={opening.id} className="grid" onSubmit={(event) => {
            event.preventDefault();
            const form = new FormData(event.currentTarget);
            onOp({ type: "connect", openingId: opening.id, fromRoomId: opening.roomId, toRoomId: String(form.get("to") || "") || null, status: form.get("status") === "confirmed" ? "confirmed" : "inferred" });
          }}>
            <span className="meta">{opening.kind} connection is {opening.connectionStatus}</span>
            <select name="to" defaultValue={opening.connectsToRoomId ?? ""} aria-label="Connects to">
              <option value="">Unresolved</option>
              {job.rooms.filter((item) => item.id !== room?.roomId).map((item) => <option key={item.id} value={item.id}>{item.name}</option>)}
            </select>
            <label className="row"><input type="checkbox" name="status" value="confirmed" /> Mark connection confirmed</label>
            <button className="btn-secondary" type="submit">Save connection</button>
          </form>
        ))}
      </aside>
    </div>
  );
}
