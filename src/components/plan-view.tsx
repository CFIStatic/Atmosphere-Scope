"use client";

import { useEffect, useMemo, useRef, useState, type PointerEvent as ReactPointerEvent, type ReactNode } from "react";
import { boundsOf } from "@/domain/geometry";
import { correctPlanEdge, correctPlanHeight, type FloorPlan, type PlanEdge } from "@/domain/plan-from-measurement";

export function PlanView({ plan, onChange }: { plan: FloorPlan; onChange: (plan: FloorPlan) => void }) {
  const [roomId, setRoomId] = useState(plan.rooms[0]?.roomId ?? "");
  const [edgeIndex, setEdgeIndex] = useState(0);
  const [lengthFt, setLengthFt] = useState("");
  const [lockWall, setLockWall] = useState(false);
  const [lockHeight, setLockHeight] = useState(false);
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
        <SketchFrame>
          <svg viewBox={view} role="img" aria-label="Floor plan from the measurement">
            <rect x={box.minX - pad} y={box.minY - pad} width={width} height={height} fill="#f0efeb" />
            {plan.rooms.map((room) => {
              const name = plan.names[room.roomId] ?? "Room";
              const cx = room.polygon.reduce((sum, point) => sum + point.x, 0) / room.polygon.length;
              const cy = room.polygon.reduce((sum, point) => sum + point.y, 0) / room.polygon.length;
              return (
                <g key={room.id} onClick={() => setRoomId(room.roomId)}>
                  <polygon points={room.polygon.map((point) => `${point.x},${point.y}`).join(" ")} fill={room.roomId === roomId ? "#f5c518" : "#f0efeb"} fillOpacity={room.roomId === roomId ? 0.45 : 1} stroke="none" />
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
        </SketchFrame>
        <p className="meta">{plan.disclaimer}</p>
      </div>
      <aside className="panel grid">
        <p className="kicker">Quantities from this plan</p>
        <table className="stack">
          <thead><tr><th>Room</th><th>Item</th><th>Qty</th><th>Status</th></tr></thead>
          <tbody>
            {plan.quantities.map((item) => (
              <tr key={`${item.roomId}-${item.kind}`}>
                <td data-label="Room">{item.roomName}</td>
                <td data-label="Item">{item.label}</td>
                <td data-label="Qty">{item.value == null ? "—" : `${item.value} ${item.unit}`}</td>
                <td data-label="Status">{item.status === "confirmed" ? <span className="chip blue">Confirmed</span> : item.status === "imported" ? <span className="chip">Imported</span> : item.status === "estimated" ? <span className="chip orange">Estimated</span> : <span className="chip">Unmeasured</span>}</td>
              </tr>
            ))}
          </tbody>
        </table>
        <form className="grid" onSubmit={(event) => {
          event.preventDefault();
          const value = Number(lengthFt);
          if (!roomId || !Number.isFinite(value) || value <= 0) return;
          onChange(correctPlanEdge(plan, roomId, edgeIndex, value, lockWall));
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
          <label className="row"><input type="checkbox" checked={lockWall} onChange={(event) => setLockWall(event.target.checked)} /> Lock this wall as confirmed</label>
          <button className="btn" type="submit">Apply wall</button>
        </form>
        <form className="grid" onSubmit={(event) => {
          event.preventDefault();
          onChange(correctPlanHeight(plan, roomId, heightFt.trim() === "" ? null : Number(heightFt), lockHeight));
        }}>
          <label className="field">Ceiling height, feet
            <input value={heightFt} onChange={(event) => setHeightFt(event.target.value)} inputMode="decimal" placeholder="Blank clears it" />
          </label>
          <label className="row"><input type="checkbox" checked={lockHeight} onChange={(event) => setLockHeight(event.target.checked)} /> Lock this ceiling as confirmed</label>
          <button className="btn secondary" type="submit">Apply height</button>
        </form>
      </aside>
    </div>
  );
}

function SketchFrame({ children }: { children: ReactNode }) {
  const wrap = useRef<HTMLDivElement>(null);
  const pointers = useRef(new Map<number, { x: number; y: number }>());
  const origin = useRef({ scale: 1, x: 0, y: 0, dist: 0, cx: 0, cy: 0 });
  const [transform, setTransform] = useState({ scale: 1, x: 0, y: 0 });

  useEffect(() => {
    const element = wrap.current;
    if (!element) return;
    const onWheel = (event: WheelEvent) => {
      event.preventDefault();
      const factor = event.deltaY < 0 ? 1.12 : 0.89;
      setTransform((current) => ({ ...current, scale: clampScale(current.scale * factor) }));
    };
    element.addEventListener("wheel", onWheel, { passive: false });
    return () => element.removeEventListener("wheel", onWheel);
  }, []);

  function onPointerDown(event: ReactPointerEvent<HTMLDivElement>) {
    event.currentTarget.setPointerCapture(event.pointerId);
    pointers.current.set(event.pointerId, { x: event.clientX, y: event.clientY });
    const points = [...pointers.current.values()];
    origin.current = { ...transform, dist: distance(points), cx: event.clientX, cy: event.clientY };
  }

  function onPointerMove(event: ReactPointerEvent<HTMLDivElement>) {
    if (!pointers.current.has(event.pointerId)) return;
    pointers.current.set(event.pointerId, { x: event.clientX, y: event.clientY });
    const points = [...pointers.current.values()];
    if (points.length >= 2) {
      const dist = distance(points);
      const next = clampScale(origin.current.scale * (dist / Math.max(origin.current.dist, 1)));
      setTransform({ scale: next, x: origin.current.x, y: origin.current.y });
      return;
    }
    setTransform({
      scale: origin.current.scale,
      x: origin.current.x + event.clientX - origin.current.cx,
      y: origin.current.y + event.clientY - origin.current.cy,
    });
  }

  function onPointerUp(event: ReactPointerEvent<HTMLDivElement>) {
    pointers.current.delete(event.pointerId);
    if (pointers.current.size === 0) origin.current = { ...transform, dist: 0, cx: 0, cy: 0 };
  }

  return (
    <div>
      <div className="row">
        <button className="btn secondary" type="button" onClick={() => setTransform({ scale: 1, x: 0, y: 0 })}>Reset view</button>
        <span className="meta">Pinch or drag the sketch. Scroll zooms on a trackpad.</span>
      </div>
      <div
        className="sketch-wrap"
        ref={wrap}
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={onPointerUp}
        onPointerCancel={onPointerUp}
      >
        <div className="sketch-transform" style={{ transform: `translate(${transform.x}px, ${transform.y}px) scale(${transform.scale})` }}>
          {children}
        </div>
      </div>
    </div>
  );
}

function distance(points: { x: number; y: number }[]): number {
  if (points.length < 2) return 0;
  return Math.hypot(points[0].x - points[1].x, points[0].y - points[1].y);
}

function clampScale(scale: number): number {
  return Math.min(6, Math.max(1, scale));
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
