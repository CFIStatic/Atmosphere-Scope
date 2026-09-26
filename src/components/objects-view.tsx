"use client";

import type { Job, RoomObject } from "@/domain/types";
import styles from "./objects-view.module.css";

const ORDER = { damaged: 0, unclear: 1, ok: 2 } as const;

export function ObjectsView({ job, objectId, onSelect }: { job: Job; objectId: string | null; onSelect: (id: string) => void }) {
  const objects = [...(job.objects ?? [])].sort((a, b) => ORDER[a.condition] - ORDER[b.condition] || a.roomName.localeCompare(b.roomName) || a.label.localeCompare(b.label));
  const selected = objects.find((object) => object.id === objectId) ?? objects[0] ?? null;
  return (
    <section className={styles.view} data-testid="objects-view" aria-label="Objects">
      {objects.length === 0 && <p className={styles.meta}>No objects yet. A walkthrough video is inventoried after it is queued. Nothing is invented when the vision call does not run.</p>}
      <div className={styles.list}>
        {objects.map((object) => {
          const lines = job.scopeItems.filter((item) => item.objectId === object.id);
          return (
            <button key={object.id} type="button" className={styles.row} data-active={selected?.id === object.id} onClick={() => onSelect(object.id)}>
              <FrameBox object={object} compact />
              <span className={styles.main}>
                <strong>{object.label}</strong>
                <span className={styles.meta}> {object.roomName} · {object.category}{object.material ? ` · ${object.material}` : ""}</span>
                <span className={styles.badges}>
                  <span className={`${styles.badge} ${styles[object.condition]}`}>{object.condition}</span>
                  <span className={styles.badge}>{quantityText(object)}</span>
                  <span className={styles.badge}>{Math.round(object.confidence * 100)}% confidence</span>
                </span>
                {object.assessedBy && <span className={styles.checked} data-testid="checked-by">Checked by {object.assessedBy}</span>}
                {lines.length > 0 && <span className={styles.meta}>{lines.map((item) => item.code).join(", ")}</span>}
              </span>
            </button>
          );
        })}
      </div>
      {selected && <ObjectDetail job={job} object={selected} />}
      <CostLog job={job} />
    </section>
  );
}

function ObjectDetail({ job, object }: { job: Job; object: RoomObject }) {
  const lines = job.scopeItems.filter((item) => item.objectId === object.id);
  return (
    <article className={styles.detail} data-testid="object-detail">
      <h2>{object.label}</h2>
      {object.assessedBy && <p className={styles.checked} data-testid="checked-by-detail">Checked by {object.assessedBy}</p>}
      <p className={styles.meta}>{object.roomName} · {object.assessment.rationale}</p>
      {object.assessment.transcriptQuote && <p>“{object.assessment.transcriptQuote}”</p>}
      <p className={styles.meta}>{object.assessment.extent.note}</p>
      <div className={styles.lines}>
        {lines.length === 0 && object.condition === "unclear" && <span className={styles.meta}>No line item. A follow-up question is open.</span>}
        {lines.map((item) => <span key={item.id} className={styles.badge}>{item.proposal ?? "draft"} · {item.code}</span>)}
      </div>
      {object.sightings.map((sighting) => (
        <figure key={`${sighting.frameId}-${sighting.timeMs}-${sighting.tile ?? "full"}`}>
          <FrameBox object={{ ...object, sightings: [sighting] }} />
          <figcaption className={styles.meta}>{formatTime(sighting.timeMs)}{sighting.tile ? ` · crop ${sighting.tile}` : " · full frame"}</figcaption>
        </figure>
      ))}
    </article>
  );
}

function FrameBox({ object, compact = false }: { object: RoomObject; compact?: boolean }) {
  const sighting = object.sightings[0];
  const box = sighting?.box ?? { x: 0, y: 0, width: 0, height: 0 };
  return (
    <svg className={compact ? styles.thumb : styles.frame} viewBox="0 0 160 90" role="img" aria-label={`${object.label} at ${formatTime(sighting?.timeMs ?? 0)}`}>
      <rect width="160" height="90" fill="var(--bg)" stroke="var(--line)" />
      <rect x={box.x * 160} y={box.y * 90} width={Math.max(2, box.width * 160)} height={Math.max(2, box.height * 90)} fill="none" stroke="var(--accent)" strokeWidth="2" />
    </svg>
  );
}

function CostLog({ job }: { job: Job }) {
  const log = job.analysisCost;
  if (!log) return null;
  return (
    <section className={styles.cost} aria-label="Analysis cost">
      <p className={styles.meta}>{log.note}</p>
      {log.escalation && (
        <p className={styles.meta} data-testid="escalation-counts">
          {log.escalation.mode}: {log.escalation.triaged} triaged, {log.escalation.escalated} escalated ({log.escalation.narration} narration, {log.escalation.audit} audit), {log.escalation.keptOk} kept ok
        </p>
      )}
      <ul>
        {log.stages.map((stage) => (
          <li key={stage.stage}>
            <strong>{stage.stage}</strong>
            <span>{stage.model}</span>
            <span>{stage.inputTokens.toLocaleString("en-US")} in / {stage.outputTokens.toLocaleString("en-US")} out</span>
            <span>{stage.latencyMs ? `${(stage.latencyMs / 1000).toFixed(1)}s` : "latency not measured"}</span>
            <span>${stage.estimatedUsd.toFixed(4)}</span>
          </li>
        ))}
        <li><strong>Total</strong><span>${log.totalEstimatedUsd.toFixed(4)}</span></li>
      </ul>
    </section>
  );
}

function quantityText(object: RoomObject): string {
  if (object.quantity.value == null) return `Unmeasured ${object.quantity.unit}`;
  const unit = object.quantity.unit === "sqft" ? "SF" : object.quantity.unit === "lf" ? "LF" : "EA";
  return `${object.quantity.value} ${unit}`;
}

function formatTime(ms: number): string {
  const total = Math.max(0, Math.round(ms / 1000));
  return `${Math.floor(total / 60)}:${String(total % 60).padStart(2, "0")}`;
}
