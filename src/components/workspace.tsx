"use client";

import dynamic from "next/dynamic";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useMemo, useState, type ReactNode } from "react";
import { jobStatusChip } from "@/domain/labels";
import { Amount } from "@/components/amount";
import { CommandBar } from "@/components/command-bar";
import { ShareJob } from "@/components/share-job";
import { TapeVerify } from "@/components/tape-verify";
import { loadWalkthrough, saveWalkthrough, type WalkthroughSnapshot } from "@/capture/snapshot";
import { floorPlanFromSketch, type FloorPlan } from "@/domain/plan-from-measurement";
import { SAMPLE_MEDIA_NOTE, visibleMediaNote } from "@/domain/media-note";
import type { Job } from "@/domain/types";
import type { SketchOp } from "@/domain/sketch-ops";
import { SketchEditor } from "./sketch-editor";
import { AppFrame } from "@/components/app-frame";
import { buildSpaceModel } from "@/spatial/model";

const SpaceMap = dynamic(() => import("./space-map").then((mod) => mod.SpaceMap), { ssr: false, loading: () => <p>Loading 3D view…</p> });

const TABS = [
  ["chat", "Chat"],
  ["happening", "Happening Now"],
  ["access", "Access"],
  ["videos", "Videos"],
  ["sketch", "Sketch"],
  ["items", "Items"],
  ["measurements", "Measurements"],
  ["estimate", "Estimate"],
] as const;

type TabId = (typeof TABS)[number][0];

export function Workspace({ initialJob, canShare = false }: { initialJob: Job; canShare?: boolean; extra?: ReactNode }) {
  const router = useRouter();
  const [job, setJob] = useState(initialJob);
  const [tab, setTab] = useState<TabId>("chat");
  const [renameOpen, setRenameOpen] = useState(false);
  const [renameDraft, setRenameDraft] = useState(initialJob.customer.name);
  const [walk, setWalk] = useState<WalkthroughSnapshot | null>(null);
  const [askSeed, setAskSeed] = useState<{ text: string; n: number } | null>(null);
  const [roomId, setRoomId] = useState<string | null>(initialJob.rooms[0]?.id ?? null);
  const [findingId, setFindingId] = useState<string | null>(initialJob.findings[0]?.id ?? null);
  const [error, setError] = useState<string | null>(null);
  const [phase, setPhase] = useState<"mitigation" | "rebuild">("mitigation");
  const version = job.estimates.find((item) => item.id === job.activeEstimateId) ?? job.estimates.at(-1) ?? null;
  const model = useMemo(() => buildSpaceModel(job), [job]);
  const findings = job.findings.filter((finding) => !roomId || finding.roomId === roomId);
  const lines = job.scopeItems.filter((item) => item.phase === phase && (!roomId || item.roomId === roomId));

  async function act(body: unknown) {
    setError(null);
    const response = await fetch(`/api/jobs/${job.id}/actions`, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(body) });
    const payload = await response.json();
    if (!response.ok) {
      setError(payload.error ?? "That action was rejected.");
      return;
    }
    setJob(payload);
  }

  const pricedLines = version?.pricedLines ?? [];
  const unpriced = pricedLines.filter((line) => line.unpricedReason !== "Excluded from price." && (line.unitPrice == null || line.unpricedReason)).length;
  const openQuestions = job.questions.filter((question) => question.status === "open");

  useEffect(() => {
    setWalk(loadWalkthrough());
    const applyHash = () => {
      const id = window.location.hash.replace("#", "");
      if (TABS.some(([key]) => key === id)) setTab(id as TabId);
    };
    applyHash();
    window.addEventListener("hashchange", applyHash);
    return () => window.removeEventListener("hashchange", applyHash);
  }, []);

  function choose(id: TabId) {
    setTab(id);
    const next = `${window.location.pathname}${window.location.search}#${id}`;
    window.history.replaceState(null, "", next);
    window.dispatchEvent(new HashChangeEvent("hashchange"));
  }

  async function duplicate() {
    const missing = [
      ["address", job.property.address],
      ["city", job.property.city],
      ["region", job.property.region],
      ["postalCode", job.property.postalCode],
      ["customerName", job.customer.name],
      ["concern", job.concern],
    ].filter(([, value]) => !String(value).trim());
    if (missing.length) {
      setError("This job is missing details, so it was not copied.");
      return;
    }
    setError(null);
    const response = await fetch("/api/jobs", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        address: job.property.address,
        city: job.property.city,
        region: job.property.region,
        postalCode: job.property.postalCode,
        customerName: job.customer.name.trim(),
        phone: job.customer.phone,
        email: job.customer.email,
        concern: job.concern,
      }),
    });
    const body = await response.json();
    if (!response.ok) {
      setError(body.error ?? "The job was not copied.");
      return;
    }
    router.push(`/jobs/${body.jobId}`);
  }

  const latestVisit = [...job.media].sort((a, b) => a.createdAt.localeCompare(b.createdAt)).at(-1);
  const crewAsk = latestVisit
    ? `What did the crew do on ${new Intl.DateTimeFormat("en-US", { weekday: "short", month: "short", day: "numeric" }).format(new Date(latestVisit.createdAt))}?`
    : "What did the crew do on the last visit?";
  const prompts = ["What happened on this job?", crewAsk, "Is anything still unfinished?"];
  const title = job.customer.name.trim() || job.property.address.trim() || "Untitled";

  return (
    <AppFrame current="/jobs">
    <main className="shell job-file">
      <header className="job-file-head">
        <h1>{title}</h1>
        <div className="job-file-actions">
          <button type="button" onClick={() => { setRenameDraft(job.customer.name); setRenameOpen(true); }}>Rename</button>
          <button type="button" onClick={() => void duplicate()}>Duplicate</button>
          {canShare && <button type="button" className="job-file-share" onClick={() => choose("access")}>Share with customer</button>}
        </div>
      </header>
      <TodayStrip job={job} />
      {error && <p className="error">{error}</p>}
      {renameOpen && (
        <form className="panel grid" onSubmit={async (event) => {
          event.preventDefault();
          const name = renameDraft.trim();
          if (name.length < 2) return;
          const response = await fetch(`/api/jobs/${job.id}`, { method: "PATCH", headers: { "content-type": "application/json" }, body: JSON.stringify({ customerName: name }) });
          if (!response.ok) {
            setError("The name was not saved.");
            return;
          }
          setJob({ ...job, customer: { ...job.customer, name } });
          setRenameOpen(false);
        }}>
          <h2>Rename this job file</h2>
          <label className="field">Name
            <input value={renameDraft} onChange={(event) => setRenameDraft(event.target.value)} minLength={2} required aria-label="Job file name" />
          </label>
          <div className="row">
            <button className="btn" type="submit">Save name</button>
            <button className="btn secondary" type="button" onClick={() => setRenameOpen(false)}>Cancel</button>
          </div>
        </form>
      )}
      <div className="job-file-scroll">
        <div className="job-file-bar" role="tablist" aria-label="Job file sections">
          {TABS.map(([id, label]) => (
            <button key={id} type="button" role="tab" id={`job-file-section-${id}`} aria-selected={tab === id} onClick={() => choose(id)}>{label}</button>
          ))}
        </div>
      </div>

      {tab === "chat" && (
        <section className="ask-panel" aria-label="Ask this job">
          <div className="ask-intro">
            <p>Forgot something? Ask what happened on site or what the homeowner said.</p>
            <div className="ask-chips">
              {prompts.map((prompt) => (
                <button key={prompt} type="button" onClick={() => setAskSeed({ text: prompt, n: Date.now() })}>{prompt}</button>
              ))}
            </div>
          </div>
          <CommandBar appearance="chat" snapshot={walk} seed={askSeed} onSnapshot={setWalk} />
        </section>
      )}
      {tab === "chat" && <Review job={job} onAct={act} />}
      {tab === "happening" && <HappeningNow job={job} unpriced={unpriced} openQuestions={openQuestions.length} status={jobStatusChip(version?.status)} />}
      {tab === "access" && (canShare ? <ShareJob jobId={job.id} /> : <p className="meta">Shared with you.</p>)}
      {tab === "videos" && (
        <section className="grid">
          <WalkthroughPlayer job={job} />
          <Capture job={job} onProcess={(transcript, usePriceBook) => act({ type: "process", transcript, usePriceBook })} onRetry={() => act({ type: "retry" })} onUploaded={setJob} />
          <Evidence job={job} findings={findings} findingId={findingId} onSelect={(id) => { setFindingId(id); const finding = job.findings.find((item) => item.id === id); if (finding?.roomId) setRoomId(finding.roomId); }} />
        </section>
      )}
      {tab === "sketch" && (
        <section className="grid">
          <RoomFilter roomId={roomId} rooms={job.rooms} onChange={setRoomId} job={job} />
          <SketchEditor job={job} onOp={(op: SketchOp) => act({ type: "sketch", op })} onUndo={() => act({ type: "undo" })} onRedo={() => act({ type: "redo" })} onAddRoom={(name) => act({ type: "add_named_room", name })} />
          <SpaceMap model={model} />
          <p className="meta">Sketch geometry.</p>
        </section>
      )}
      {tab === "items" && (
        <>
          <RoomFilter roomId={roomId} rooms={job.rooms} onChange={setRoomId} job={job} />
          <Estimate job={job} phase={phase} setPhase={setPhase} lines={lines} version={version} onAffected={(sqft) => roomId && act({ type: "set_affected", roomId, sqft, note: "Entered from the estimate tab." })} onApply={() => act({ type: "apply_quantities" })} onEdit={(itemId, quantityValue) => act({ type: "edit_scope", itemId, quantityValue })} onSelectRoom={(id) => setRoomId(id)} />
        </>
      )}
      {tab === "measurements" && (
        <section className="grid">
          <h2>Verify with a tape</h2>
          <JobTape job={job} onSketch={(op) => act({ type: "sketch", op })} />
          <Assessment job={job} findings={findings} onSave={(findingId, title, interpretation) => act({ type: "correct_finding", findingId, title, interpretation })} onOpen={(id) => { setFindingId(id); choose("videos"); }} />
          <Questions job={job} onAnswer={(questionId, answer) => act({ type: "answer", questionId, answer, kind: "text" })} />
          <Link className="btn secondary" href="/results">Open results</Link>
        </section>
      )}
      {tab === "estimate" && version && (
        <form className="panel form-grid" onSubmit={(event) => {
          event.preventDefault();
          const form = new FormData(event.currentTarget);
          const mode = String(form.get("mode")) === "margin" ? "margin" : "markup";
          act({
            type: "settings",
            settings: {
              ...version.settings,
              mode,
              markupPercent: Number(form.get("markup")) / 100,
              marginPercent: Number(form.get("margin")) / 100,
              overheadPercent: Number(form.get("overhead")) / 100,
              taxRate: Number(form.get("tax")) / 100,
              locationName: String(form.get("location") || version.settings.locationName),
            },
          });
        }}>
          <p className="kicker">Price settings</p>
          <label className="field">Mode<select name="mode" defaultValue={version.settings.mode}><option value="markup">Markup on cost</option><option value="margin">Target margin</option></select></label>
          <label className="field">Markup %<input name="markup" type="number" step="0.1" defaultValue={version.settings.markupPercent * 100} /></label>
          <label className="field">Margin %<input name="margin" type="number" step="0.1" defaultValue={version.settings.marginPercent * 100} /></label>
          <label className="field">Overhead %<input name="overhead" type="number" step="0.1" defaultValue={version.settings.overheadPercent * 100} /></label>
          <label className="field">Tax %<input name="tax" type="number" step="0.1" defaultValue={version.settings.taxRate * 100} /></label>
          <label className="field">Location label<input name="location" defaultValue={version.settings.locationName} /></label>
          <button className="btn" type="submit">Update draft pricing</button>
        </form>
      )}
      {tab === "estimate" && (
        <section className="panel grid">
          <p>Report</p>
          <div className="row">
            <a className="btn" href={`/api/jobs/${job.id}/export/pdf`}>PDF</a>
            <a className="btn-secondary" href={`/api/jobs/${job.id}/export/csv`}>CSV</a>
            <a className="btn-secondary" href={`/api/jobs/${job.id}/export/svg`}>SVG</a>
            <a className="btn-secondary" href={`/api/jobs/${job.id}/export/json`}>JSON</a>
            <Link className="btn secondary" href="/estimate">Open estimate</Link>
          </div>
        </section>
      )}
    </main>
    </AppFrame>
  );
}

function RoomFilter({ roomId, rooms, onChange, job }: { roomId: string | null; rooms: Job["rooms"]; onChange: (id: string | null) => void; job: Job }) {
  return (
    <div className="row">
      <label className="field">Room filter
        <select value={roomId ?? ""} onChange={(event) => onChange(event.target.value || null)}>
          <option value="">All rooms</option>
          {rooms.map((room) => <option key={room.id} value={room.id}>{room.name}</option>)}
        </select>
      </label>
      <span className="badge">{job.sketch.state.replaceAll("_", " ")}</span>
      <span className="badge">{job.sketch.scaleClaim === "to_scale" ? "to scale" : "not to scale"}</span>
      <span className="badge">{job.processing.status}</span>
    </div>
  );
}

function HappeningNow({ job, unpriced, openQuestions, status }: { job: Job; unpriced: number; openQuestions: number; status: string }) {
  const clips = [...job.media].sort((a, b) => b.createdAt.localeCompare(a.createdAt));
  const running = job.processing.status === "running";
  const left = unpriced + openQuestions;
  return (
    <section className="happening" aria-label="Happening Now">
      <h2>Happening Now</h2>
      <p className="happening-hint">What&apos;s on site right now, what&apos;s done, and what&apos;s left.</p>
      <div className="happening-row">
        <h3>Now</h3>
        <div>{running ? <p>Processing this walkthrough.</p> : <p className="meta">Nothing on site.</p>}</div>
      </div>
      <div className="happening-row">
        <h3>Done</h3>
        <div>
          {clips.length === 0 ? <p className="meta">Nothing done.</p> : (
            <ul className="happening-list">
              {clips.map((clip) => (
                <li key={clip.id}>
                  <div>
                    <strong>{visitTitle(clip.createdAt, clip.label)}</strong>
                    {visibleMediaNote(clip.note) ? <p>{visibleMediaNote(clip.note)}</p> : null}
                  </div>
                  <span className="chip chip-neutral">{status}</span>
                </li>
              ))}
            </ul>
          )}
        </div>
      </div>
      <div className="happening-row">
        <h3>Left</h3>
        <div>
          {left === 0 ? <p className="meta">Nothing left.</p> : (
            <ul className="happening-list">
              {unpriced > 0 && <li><div><strong>{unpriced} still need a price</strong></div><span className="chip chip-yellow">Needs price</span></li>}
              {openQuestions > 0 && <li><div><strong>{openQuestions} open {openQuestions === 1 ? "question" : "questions"}</strong></div><span className="chip chip-neutral">Open</span></li>}
            </ul>
          )}
        </div>
      </div>
    </section>
  );
}

function visitTitle(iso: string, label: string): string {
  const date = new Date(iso);
  const day = Number.isNaN(date.getTime()) ? "—" : new Intl.DateTimeFormat("en-US", { weekday: "short", month: "short", day: "numeric" }).format(date);
  const name = label.trim() || "Field capture";
  return `${day} · ${name}`;
}

function localDateKey(value: string | Date): string {
  const date = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(date.getTime())) return "";
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${date.getFullYear()}-${month}-${day}`;
}

function TodayStrip({ job }: { job: Job }) {
  const today = localDateKey(new Date());
  const real = job.media.filter((item) => localDateKey(item.createdAt) === today && item.note?.trim() !== SAMPLE_MEDIA_NOTE).length;
  if (!real) return null;
  return (
    <p className="job-file-today" data-testid="job-file-today">
      <strong>What changed today</strong>
      <span className="meta">{real} new {real === 1 ? "clip" : "clips"}</span>
    </p>
  );
}

function WalkthroughPlayer({ job }: { job: Job }) {
  const video = job.media.find((item) => item.kind === "video" && item.storageKey);
  if (!video) return <p className="meta">No walkthrough video.</p>;
  return <video className="job-file-player" controls playsInline src={`/api/jobs/${job.id}/media/${video.id}`} />;
}

function JobTape({ job, onSketch }: { job: Job; onSketch: (op: SketchOp) => void }) {
  const [plan, setPlan] = useState<FloorPlan | null>(null);
  useEffect(() => {
    const snapshot = loadWalkthrough();
    if (snapshot?.jobId === job.id && snapshot.plan.rooms.length > 0) {
      setPlan(snapshot.plan);
      return;
    }
    const names = Object.fromEntries(job.rooms.map((room) => [room.id, room.name]));
    const derived = floorPlanFromSketch(job.sketch, names);
    setPlan(derived.edges.length > 0 || Object.keys(derived.ceilingHeights).length > 0 ? derived : null);
  }, [job]);
  if (!plan || (plan.edges.length === 0 && Object.keys(plan.ceilingHeights).length === 0)) return <p className="meta">No measurements yet.</p>;
  return (
    <TapeVerify plan={plan} onPlan={(next) => {
      const snapshot = loadWalkthrough();
      if (snapshot?.jobId === job.id) {
        saveWalkthrough({ ...snapshot, plan: next });
        setPlan(next);
        return;
      }
      const edge = next.edges.find((item) => {
        const previous = plan.edges.find((row) => row.roomId === item.roomId && row.edgeIndex === item.edgeIndex);
        return !!previous && item.valueFt != null && (previous.valueFt !== item.valueFt || previous.status !== item.status);
      });
      if (edge?.valueFt != null) {
        onSketch({ type: "set_edge", roomId: edge.roomId, edgeIndex: edge.edgeIndex, lengthFt: edge.valueFt, lock: edge.status === "confirmed", sourceNote: "Locked by a user measurement." });
      }
      for (const [roomId, height] of Object.entries(next.ceilingHeights)) {
        const previous = plan.ceilingHeights[roomId];
        if (!previous || (previous.valueFt === height.valueFt && previous.status === height.status)) continue;
        onSketch({ type: "set_height", roomId, valueFt: height.valueFt, lock: height.status === "confirmed", sourceNote: "Locked by a user measurement." });
      }
      setPlan(next);
    }} />
  );
}

function Capture({ job, onProcess, onRetry, onUploaded }: { job: Job; onProcess: (transcript: string, usePriceBook: boolean) => void; onRetry: () => void; onUploaded: (job: Job) => void }) {
  const [transcript, setTranscript] = useState("");
  return (
    <section className="split">
      <div className="panel grid">
        <p className="kicker">Walk</p>
        <ol>
          <li>Name the room.</li>
          <li>Show corners, walls, ceiling, floor, doors, and windows.</li>
          <li>Show each doorway.</li>
          <li>Show affected areas and state the measurement.</li>
          <li>Read instrument values and the location.</li>
          <li>Repair requests stay pending until an estimator confirms them.</li>
        </ol>
        <label className="field">Narration
          <textarea rows={6} value={transcript} onChange={(event) => setTranscript(event.target.value)} placeholder="Kitchen. Ceiling stain is dry. Wall is 12 ft." />
        </label>
        <div className="row">
          <button className="btn" type="button" onClick={() => onProcess(transcript, false)}>Build scope</button>
          {job.processing.status === "failed" && <button className="btn-secondary" type="button" onClick={onRetry}>Retry failed stage</button>}
        </div>
        {job.processing.lastError && <p className="error">{job.processing.lastError}</p>}
        <ul>{Object.entries(job.processing.stages).map(([name, stage]) => <li key={name}>{name}: {stage.status}{stage.message ? ` — ${stage.message}` : ""}</li>)}</ul>
      </div>
      <Upload jobId={job.id} notes={job.coverageNotes} media={job.media} onUploaded={onUploaded} />
    </section>
  );
}

function Upload({ jobId, notes, media, onUploaded }: { jobId: string; notes: string[]; media: Job["media"]; onUploaded: (job: Job) => void }) {
  const [message, setMessage] = useState<string | null>(null);
  return (
    <div className="panel grid">
      <p className="kicker">Clips, photos, plans, depth</p>
      <form onSubmit={async (event) => {
        event.preventDefault();
        const form = new FormData(event.currentTarget);
        const response = await fetch(`/api/jobs/${jobId}/media`, { method: "POST", body: form });
        const payload = await response.json();
        if (!response.ok || !payload.job) {
          setMessage(payload.error ?? "Upload failed.");
          return;
        }
        onUploaded(payload.job);
        setMessage("Stored.");
      }}>
        <input name="file" type="file" accept="video/*,image/*,.json,.ply" required />
        <button className="btn" type="submit">Upload</button>
      </form>
      {message && <p className="meta">{message}</p>}
      <Recorder />
      <ul>{media.map((item) => <li key={item.id}>{item.label} · {item.kind}</li>)}</ul>
      {notes.length > 0 && <div><strong>Coverage gaps</strong><ul>{notes.map((note) => <li key={note}>{note}</li>)}</ul></div>}
    </div>
  );
}

function Recorder() {
  const [state, setState] = useState("Idle");
  return (
    <button
      className="btn-secondary"
      type="button"
      onClick={async () => {
        if (!navigator.mediaDevices?.getUserMedia) {
          setState("This browser cannot record.");
          return;
        }
        const stream = await navigator.mediaDevices.getUserMedia({ video: true, audio: true });
        const recorder = new MediaRecorder(stream);
        const chunks: Blob[] = [];
        recorder.ondataavailable = (event) => chunks.push(event.data);
        recorder.onstop = () => {
          stream.getTracks().forEach((track) => track.stop());
          setState(`Recorded ${chunks.reduce((sum, chunk) => sum + chunk.size, 0)} bytes.`);
        };
        recorder.start();
        setState("Recording. 4 seconds.");
        setTimeout(() => recorder.stop(), 4000);
      }}
    >
      {state === "Idle" ? "Record a short clip" : state}
    </button>
  );
}

function Evidence({ job, findings, findingId, onSelect }: { job: Job; findings: Job["findings"]; findingId: string | null; onSelect: (id: string) => void }) {
  const finding = job.findings.find((item) => item.id === findingId);
  const media = job.media.find((item) => item.id === finding?.evidence[0]?.mediaId);
  return (
    <section className="split">
      <div className="panel">
        <p className="kicker">Timestamped findings</p>
        <div className="list">
          {findings.map((item) => (
            <button key={item.id} className={item.id === findingId ? "item active" : "item"} type="button" onClick={() => onSelect(item.id)}>
              <span className={`badge ${item.evidenceClass}`}>{item.evidenceClass.replaceAll("_", " ")}</span>
              <strong> {item.title}</strong>
              <div className="meta">{item.locationNote} · {item.origin}{item.humanCorrected ? " · human corrected" : ""}</div>
            </button>
          ))}
        </div>
      </div>
      <aside className="panel grid">
        {media?.storageKey && <video controls src={`/api/jobs/${job.id}/media/${media.id}`} />}
        {!media?.storageKey && <p className="meta">No video file. Transcript and frames are the record.</p>}
        {finding && (
          <>
            <h2>{finding.title}</h2>
            {finding.observableCondition && <p><strong>Observed.</strong> {finding.observableCondition}</p>}
            {finding.narratorReport && <p><strong>Reported.</strong> {finding.narratorReport}</p>}
            {finding.interpretation && <p><strong>Interpretation.</strong> {finding.interpretation}</p>}
            {finding.uncertainty && <p className="meta">{finding.uncertainty}</p>}
          </>
        )}
        <h3>Narration</h3>
        {job.transcripts.map((segment) => (
          <p key={segment.id} className="meta">{(segment.startMs / 1000).toFixed(1)}s {segment.injectionFlags.length ? "· instruction-like language ignored" : ""} — {segment.text}</p>
        ))}
      </aside>
    </section>
  );
}

function Assessment({ job, findings, onSave, onOpen }: { job: Job; findings: Job["findings"]; onSave: (id: string, title: string, interpretation: string) => void; onOpen: (id: string) => void }) {
  return (
    <div className="list">
      {findings.map((finding) => (
        <article key={finding.id} className="panel">
          <span className={`badge ${finding.evidenceClass}`}>{finding.evidenceClass.replaceAll("_", " ")}</span>
          <h2>{finding.title}</h2>
          <p className="meta">{job.rooms.find((room) => room.id === finding.roomId)?.name ?? "Unassigned"} · {finding.locationNote}</p>
          <p>{finding.interpretation}</p>
          <button className="btn-secondary" type="button" onClick={() => onOpen(finding.id)}>Open evidence</button>
          <form className="grid" onSubmit={(event) => {
            event.preventDefault();
            const form = new FormData(event.currentTarget);
            onSave(finding.id, String(form.get("title")), String(form.get("interpretation")));
          }}>
            <input name="title" defaultValue={finding.title} aria-label="Finding title" />
            <textarea name="interpretation" defaultValue={finding.interpretation ?? ""} aria-label="Interpretation" />
            <button className="btn" type="submit">Save correction</button>
          </form>
        </article>
      ))}
    </div>
  );
}

function Questions({ job, onAnswer }: { job: Job; onAnswer: (id: string, answer: string) => void }) {
  return (
    <div className="list">
      {job.questions.length === 0 && <p>No open questions.</p>}
      {job.questions.map((question) => (
        <article key={question.id} className="panel">
          <span className="badge">priority {question.priority}</span>
          <h2>{question.prompt}</h2>
          <p className="meta">{question.why}</p>
          {question.status === "answered" ? <p>Answer: {question.answer}</p> : (
            <form className="row" onSubmit={(event) => {
              event.preventDefault();
              const answer = String(new FormData(event.currentTarget).get("answer") ?? "");
              if (answer.trim()) onAnswer(question.id, answer);
            }}>
              <input name="answer" aria-label="Answer" placeholder="Measurement, note, or test result" />
              <button className="btn" type="submit">Save answer</button>
            </form>
          )}
        </article>
      ))}
    </div>
  );
}

function Estimate({ job, phase, setPhase, lines, version, onAffected, onApply, onEdit, onSelectRoom }: {
  job: Job;
  phase: "mitigation" | "rebuild";
  setPhase: (phase: "mitigation" | "rebuild") => void;
  lines: Job["scopeItems"];
  version: Job["estimates"][number] | null;
  onAffected: (sqft: number) => void;
  onApply: () => void;
  onEdit: (itemId: string, quantityValue: number) => void;
  onSelectRoom: (id: string) => void;
}) {
  return (
    <section className="grid">
      <div className="row">
        <button className={phase === "mitigation" ? "btn" : "btn-secondary"} type="button" onClick={() => setPhase("mitigation")}>Mitigation</button>
        <button className={phase === "rebuild" ? "btn" : "btn-secondary"} type="button" onClick={() => setPhase("rebuild")}>Rebuild</button>
      </div>
      {version && (
        <div className="kpi" aria-label="Estimate totals">
          <div><span>Mitigation</span><strong><Amount value={version.totals.mitigationSubtotal} /></strong></div>
          <div><span>Rebuild</span><strong><Amount value={version.totals.rebuildSubtotal} /></strong></div>
          <div><span>Supported</span><strong><Amount value={version.totals.supportedTotal} /></strong></div>
          <div><span>Conditional</span><strong><Amount value={version.totals.conditionalAllowance} /></strong></div>
          <div><span>Optional</span><strong><Amount value={version.totals.optionalAllowance} /></strong></div>
        </div>
      )}
      <p className="meta">{version?.totals.label === "complete" ? "Complete." : "Partial. Unpriced lines excluded."}</p>
      {job.pendingQuantityChanges.length > 0 && (
        <div className="banner">
          {job.pendingQuantityChanges.length} quantities changed. Not applied.
          <button className="btn" type="button" onClick={onApply}>Apply</button>
        </div>
      )}
      <form className="row" onSubmit={(event) => {
        event.preventDefault();
        onAffected(Number(new FormData(event.currentTarget).get("sqft")));
      }}>
        <input name="sqft" type="number" step="0.1" min="0" placeholder="Affected sqft for filtered room" aria-label="Affected area" />
        <button className="btn-secondary" type="submit">Set affected area</button>
      </form>
      <table className="data">
        <thead><tr><th>Class</th><th>Line</th><th className="num">Qty</th><th>Unit</th><th className="num">Amount</th></tr></thead>
        <tbody>
          {lines.map((item) => {
            const priced = version?.pricedLines.find((line) => line.scopeItemId === item.id);
            const amount = priced?.unpricedReason || priced?.extendedPrice == null ? null : priced.extendedPrice;
            return (
              <tr key={item.id}>
                <td data-label="Class">{item.scopeClass}</td>
                <td data-label="Line">
                  <button type="button" className="btn-secondary" onClick={() => item.roomId && onSelectRoom(item.roomId)}>{item.location}</button>
                  <div>{item.description}</div>
                </td>
                <td className="num" data-label="Qty">
                  {item.quantity.value == null ? "—" : item.quantity.value.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                  <form onSubmit={(event) => {
                    event.preventDefault();
                    onEdit(item.id, Number(new FormData(event.currentTarget).get("qty")));
                  }}>
                    <input name="qty" type="number" step="0.1" aria-label={`Quantity for ${item.description}`} placeholder="Qty" />
                  </form>
                </td>
                <td data-label="Unit">{item.quantity.unit}</td>
                <td className="num" data-label="Amount"><Amount value={amount} /></td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </section>
  );
}

function Review({ job, onAct }: { job: Job; onAct: (body: unknown) => void }) {
  return (
    <section className="grid">
      <div className="panel grid">
        <p className="kicker">Estimator</p>
        <p className="meta">Estimator approval and customer authorization are separate.</p>
        <a className="btn secondary" href="/account">Account</a>
        <form className="row" onSubmit={(event) => { event.preventDefault(); onAct({ type: "mark_reviewed", actorName: String(new FormData(event.currentTarget).get("name")) }); }}>
          <input name="name" placeholder="Estimator name" required aria-label="Estimator name" />
          <button className="btn" type="submit">Mark reviewed</button>
        </form>
        <form className="row" onSubmit={(event) => { event.preventDefault(); onAct({ type: "approve", actorName: String(new FormData(event.currentTarget).get("name")) }); }}>
          <input name="name" placeholder="Estimator name" required aria-label="Approver name" />
          <button className="btn-secondary" type="submit">Approve proposal</button>
        </form>
      </div>
      <div className="panel grid">
        <p className="kicker">Customer authorization</p>
        <p className="meta">Names the accepted version.</p>
        <form className="grid" onSubmit={(event) => {
          event.preventDefault();
          const form = new FormData(event.currentTarget);
          onAct({ type: "authorize", actorName: String(form.get("name")), statement: String(form.get("statement")) });
        }}>
          <input name="name" placeholder="Customer name" required aria-label="Customer name" />
          <textarea name="statement" required placeholder="I accept this version of the scope and estimate." />
          <button className="btn" type="submit">Record authorization</button>
        </form>
      </div>
      <div className="panel">
        <h2>Versions</h2>
        {job.estimates.map((version) => <p key={version.id}>v{version.number} · {version.status}{version.changeRequest ? ` · ${version.changeRequest}` : ""}</p>)}
        <h2>History</h2>
        {job.audit.slice().reverse().slice(0, 12).map((event) => <p key={event.id} className="meta">{event.action}: {event.detail}</p>)}
      </div>
    </section>
  );
}
