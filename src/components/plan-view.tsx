"use client";

import { useMemo, useState } from "react";
import { boundsOf } from "@/domain/geometry";
import { correctPlanEdge, correctPlanHeight, type FloorPlan, type PlanEdge } from "@/domain/plan-from-measurement";

export function PlanView({ plan, onChange }: { plan: FloorPlan; onChange: (plan: FloorPlan) => void }) {
  const [roomId, setRoomId] = useState(plan.rooms[0]?.roomId ?? "");
  const [edgeIndex, setEdgeIndex] = useState(0);
  const [lengthFt, setLengthFt] = useState("");
  const [lock, setLock] = useState(false);
  const [heightFt, setHeightFt] = useState("");
  const box = useMemo(() => boundsOf(plan.rooms), [plan.rooms]);
  const pad = 2.4;
  const width = Math.max(12, box.maxX - box.minX + pad * 2);
  const height = Math.max(10, box.maxY - box.minY + pad * 2);
  const view = `${box.minX - pad} ${box.minY - pad} ${width} ${height}`;
  const edges = plan.edges.filter((edge) => edge.roomId === roomId);

  return (
    <div className="split">
      <div>
        <p className="legend meta"><i /> measured, estimated · <i className="solid-blue" /> confirmed · <i className="dashed" /> unmeasured</p>
        <div className="sketch-wrap">
          <svg viewBox={view} role="img" aria-label="Floor plan from the measurement">
            <rect x={box.minX - pad} y={box.minY - pad} width={width} height={height} fill="#f7f5f0" />
            {plan.rooms.map((room) => {
              const name = plan.names[room.roomId] ?? "Room";
              const cx = room.polygon.reduce((sum, point) => sum + point.x, 0) / room.polygon.length;
              const cy = room.polygon.reduce((sum, point) => sum + point.y, 0) / room.polygon.length;
              return (
                <g key={room.id} onClick={() => setRoomId(room.roomId)}>
                  <polygon points={room.polygon.map((point) => `${point.x},${point.y}`).join(" ")} fill={room.roomId === roomId ? "#e7eeff" : "#f3f1eb"} stroke="none" />
                  <text x={cx} y={cy} fontSize={0.42} textAnchor="middle" fill="#161616">{name}</text>
                </g>
              );
            })}
            {plan.edges.map((edge) => {
              const room = plan.rooms.find((item) => item.roomId === edge.roomId);
              if (!room) return null;
              const start = room.polygon[edge.edgeIndex];
              const end = room.polygon[(edge.edgeIndex + 1) % room.polygon.length];
              return <Wall key={`${edge.roomId}-${edge.edgeIndex}`} edge={edge} x1={start.x} y1={start.y} x2={end.x} y2={end.y} />;
            })}
            {plan.openings.map((opening) => {
              const room = plan.rooms.find((item) => item.roomId === opening.roomId);
              if (!room) return null;
              const start = room.polygon[opening.edgeIndex];
              const end = room.polygon[(opening.edgeIndex + 1) % room.polygon.length];
              const x = start.x + (end.x - start.x) * 0.5;
              const y = start.y + (end.y - start.y) * 0.5;
              return <text key={opening.id} x={x} y={y + 0.35} fontSize={0.28} textAnchor="middle" fill="#161616">{opening.kind} {opening.widthFt == null ? "?" : `${opening.widthFt} ft`}</text>;
            })}
            {plan.annotations.map((note) => (
              <g key={note.id}>
                <circle cx={note.at.x} cy={note.at.y} r={0.18} fill={note.text.startsWith("Moisture") ? "#e07a2f" : "#161616"} />
                <text x={note.at.x + 0.3} y={note.at.y} fontSize={0.28} fill="#161616">{note.text}</text>
              </g>
            ))}
          </svg>
        </div>
        <p className="meta">{plan.disclaimer}</p>
      </div>
      <aside className="panel grid">
        <p className="kicker">Quantities from this plan</p>
        <table>
          <thead><tr><th>Room</th><th>Item</th><th>Qty</th><th>Status</th></tr></thead>
          <tbody>
            {plan.quantities.map((item) => (
              <tr key={`${item.roomId}-${item.kind}`}>
                <td>{item.roomName}</td>
                <td>{item.label}</td>
                <td>{item.value == null ? "—" : `${item.value} ${item.unit}`}</td>
                <td>{item.status === "confirmed" ? <span className="chip blue">Confirmed</span> : item.status === "imported" ? <span className="chip">Imported</span> : item.status === "estimated" ? <span className="chip orange">Estimated</span> : <span className="chip">Unmeasured</span>}</td>
              </tr>
            ))}
          </tbody>
        </table>
        <form className="grid" onSubmit={(event) => {
          event.preventDefault();
          const value = Number(lengthFt);
          if (!roomId || !Number.isFinite(value) || value <= 0) return;
          onChange(correctPlanEdge(plan, roomId, edgeIndex, value, lock));
        }}>
          <label className="field">Wall
            <select value={`${roomId}:${edgeIndex}`} onChange={(event) => {
              const [nextRoom, nextEdge] = event.target.value.split(":");
              setRoomId(nextRoom);
              setEdgeIndex(Number(nextEdge));
            }}>
              {edges.map((edge) => <option key={edge.edgeIndex} value={`${edge.roomId}:${edge.edgeIndex}`}>Edge {edge.edgeIndex + 1} · {edge.label}</option>)}
            </select>
          </label>
          <label className="field">Corrected length, feet
            <input value={lengthFt} onChange={(event) => setLengthFt(event.target.value)} inputMode="decimal" />
          </label>
          <label className="row"><input type="checkbox" checked={lock} onChange={(event) => setLock(event.target.checked)} /> Lock this wall as confirmed</label>
          <button className="btn" type="submit">Apply wall</button>
        </form>
        <form className="grid" onSubmit={(event) => {
          event.preventDefault();
          onChange(correctPlanHeight(plan, roomId, heightFt.trim() === "" ? null : Number(heightFt), lock));
        }}>
          <label className="field">Ceiling height, feet
            <input value={heightFt} onChange={(event) => setHeightFt(event.target.value)} inputMode="decimal" placeholder="Blank clears it" />
          </label>
          <button className="btn secondary" type="submit">Apply height</button>
        </form>
      </aside>
    </div>
  );
}

function Wall({ edge, x1, y1, x2, y2 }: { edge: PlanEdge; x1: number; y1: number; x2: number; y2: number }) {
  const color = edge.status === "confirmed" ? "#2f5bff" : "#161616";
  return (
    <g>
      <line x1={x1} y1={y1} x2={x2} y2={y2} stroke={color} strokeWidth={edge.status === "unmeasured" ? 0.06 : 0.1} strokeDasharray={edge.stroke === "dashed" ? "0.28 0.16" : undefined} />
      <text x={(x1 + x2) / 2} y={(y1 + y2) / 2 - 0.22} fontSize={0.28} textAnchor="middle" fill={edge.status === "estimated" ? "#e07a2f" : color}>{edge.label}</text>
    </g>
  );
}
