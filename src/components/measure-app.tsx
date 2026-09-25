"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { chunkCount, getCapture, listPendingCaptures, putCapture, saveChunk } from "@/capture/db";
import { captureStatusLabel } from "@/capture/plan";
import { resumeCapture } from "@/capture/resume-client";
import { fuseDimension, type FusedDimension, type Reading, type ScaleSource } from "@/domain/fusion";
import { saveWalkthrough } from "@/capture/snapshot";
import { floorPlanFromMeasurement, type FloorPlan, type MeasuredRoomInput } from "@/domain/plan-from-measurement";
import { notesFromNarration, type AssistState } from "@/domain/assist";
import { dimensionLabel } from "@/domain/labels";

type SolverDimension = {
  id: string;
  kind: string;
  label: string;
  valueFt: number | null;
  errorPercent: number | null;
  meetsAccuracyTarget: boolean;
  confirmed: boolean;
  sources: string[];
  note: string;
  ask: string | null;
};

type Offer = {
  query: string;
  title: string | null;
  retailer: string | null;
  price: number | null;
  currency: string | null;
  url: string | null;
  retrievedAt: string | null;
  status: "verified" | "unverified" | "unpriced";
  note: string;
};

type SolverResult = {
  method: string;
  framesUsed?: number;
  calibrationRmsPx?: number | null;
  cpuMs?: number;
  extractMs?: number;
  solveMs?: number;
  notes?: string[];
  polygonFt?: { x: number; y: number }[];
  rooms?: MeasuredRoomInput[];
  dimensions: SolverDimension[];
  error?: string;
  videoKey?: string | null;
  ai?: {
    transcription: { status: string; text: string | null; note: string };
    objects: { name: string; room: string | null; evidence: string; confidence: string; frames: string[]; links?: { frame: string; timeMs: number | null }[] }[];
    objectNote: string;
    offers: Offer[];
    pricing: { reason: string };
    measurement: { note: string };
  };
};

function readSignal(): "online" | "weak" | "offline" {
  if (typeof navigator === "undefined" || navigator.onLine === false) return "offline";
  const connection = (navigator as Navigator & { connection?: { effectiveType?: string; rtt?: number } }).connection;
  if (connection?.effectiveType === "slow-2g" || connection?.effectiveType === "2g" || (connection?.rtt != null && connection.rtt >= 800)) return "weak";
  return "online";
}

function sourceForMethod(method: string): ScaleSource {
  if (method === "charuco_multiview") return "charuco";
  if (method === "door" || method === "door_prior") return "door_prior";
  return "none";
}

function blurScore(data: ImageData): number {
  const { data: pixels, width, height } = data;
  let sum = 0;
  let sumSq = 0;
  let count = 0;
  for (let y = 1; y < height; y += 4) {
    for (let x = 1; x < width; x += 4) {
      const index = (y * width + x) * 4;
      const gray = pixels[index] * 0.3 + pixels[index + 1] * 0.59 + pixels[index + 2] * 0.11;
      const left = pixels[index - 4] * 0.3 + pixels[index - 3] * 0.59 + pixels[index - 2] * 0.11;
      const upIndex = ((y - 1) * width + x) * 4;
      const up = pixels[upIndex] * 0.3 + pixels[upIndex + 1] * 0.59 + pixels[upIndex + 2] * 0.11;
      const edge = Math.abs(gray - left) + Math.abs(gray - up);
      sum += edge;
      sumSq += edge * edge;
      count += 1;
    }
  }
  const mean = sum / Math.max(count, 1);
  return sumSq / Math.max(count, 1) - mean * mean;
}

function planFromResult(result: SolverResult): FloorPlan {
  if (result.rooms?.length) return floorPlanFromMeasurement(result.rooms);
  return floorPlanFromMeasurement([{
    id: "room",
    name: "Room",
    polygonFt: result.polygonFt,
    dimensions: result.dimensions.map((dimension) => ({
      kind: dimension.kind,
      label: dimension.label,
      valueFt: dimension.valueFt,
      errorPercent: dimension.errorPercent,
      meetsAccuracyTarget: dimension.meetsAccuracyTarget,
      confirmed: dimension.confirmed,
      sources: dimension.sources,
      note: dimension.note,
    })),
  }]);
}

function sliceBlob(blob: Blob, size = 256 * 1024): Blob[] {
  if (blob.size === 0) return [blob];
  const parts: Blob[] = [];
  for (let offset = 0; offset < blob.size; offset += size) parts.push(blob.slice(offset, offset + size, blob.type));
  return parts;
}

export function MeasureApp() {
  const router = useRouter();
  const videoRef = useRef<HTMLVideoElement>(null);
  const [coach, setCoach] = useState("Place the sheet, then record.");
  const [recording, setRecording] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<SolverResult | null>(null);
  const [processStep, setProcessStep] = useState(0);
  const [tapeLabel, setTapeLabel] = useState("span_a");
  const [tapeValue, setTapeValue] = useState("");
  const [signal, setSignal] = useState<"online" | "weak" | "offline">("online");
  const [queue, setQueue] = useState<{ id: string; filename: string; status: string; totalChunks: number; error: string | null }[]>([]);
  const [progress, setProgress] = useState<{ sent: number; total: number } | null>(null);
  const [micLevel, setMicLevel] = useState(0);
  const [micNote, setMicNote] = useState("Mic level appears once recording starts.");
  const [uploadStatus, setUploadStatus] = useState("");
  const audioContext = useRef<AudioContext | null>(null);
  const meterFrame = useRef<number | null>(null);
  const recorder = useRef<MediaRecorder | null>(null);
  const chunks = useRef<Blob[]>([]);
  const captureId = useRef<string | null>(null);
  const saveChain = useRef(Promise.resolve());
  const previous = useRef<ImageData | null>(null);

  useEffect(() => {
    if (!busy) return;
    setProcessStep(0);
    const timer = window.setInterval(() => setProcessStep((step) => Math.min(step + 1, 2)), 900);
    return () => window.clearInterval(timer);
  }, [busy]);

  useEffect(() => {
    setSignal(readSignal());
    const markOnline = () => {
      setSignal(readSignal());
      void flushPending();
    };
    const markOffline = () => {
      setSignal("offline");
      setUploadStatus(captureStatusLabel({ online: false, phase: "saved", sent: 0, total: 0 }));
    };
    const onVisible = () => {
      if (document.visibilityState === "visible") void flushPending();
    };
    window.addEventListener("online", markOnline);
    window.addEventListener("offline", markOffline);
    document.addEventListener("visibilitychange", onVisible);
    if ("serviceWorker" in navigator) {
      void navigator.serviceWorker.register("/sw.js").then((registration) => {
        const sync = (registration as ServiceWorkerRegistration & { sync?: { register: (tag: string) => Promise<void> } }).sync;
        return sync?.register("upload-captures");
      }).catch(() => undefined);
      navigator.serviceWorker.addEventListener("message", (event) => {
        if (event.data?.type === "resume-uploads") void flushPending();
      });
    }
    void navigator.storage?.persist?.();
    void flushPending();
    return () => {
      window.removeEventListener("online", markOnline);
      window.removeEventListener("offline", markOffline);
      document.removeEventListener("visibilitychange", onVisible);
    };
  }, []);

  useEffect(() => {
    if (!recording) return;
    const timer = window.setInterval(async () => {
      const video = videoRef.current;
      if (!video || video.videoWidth === 0) return;
      const canvas = document.createElement("canvas");
      canvas.width = 320;
      canvas.height = Math.round((320 * video.videoHeight) / video.videoWidth);
      const context = canvas.getContext("2d", { willReadFrequently: true });
      if (!context) return;
      context.drawImage(video, 0, 0, canvas.width, canvas.height);
      const frame = context.getImageData(0, 0, canvas.width, canvas.height);
      const blur = blurScore(frame);
      let motion = 0;
      if (previous.current && previous.current.data.length === frame.data.length) {
        let total = 0;
        let count = 0;
        for (let index = 0; index < frame.data.length; index += 16) {
          total += Math.abs(frame.data[index] - previous.current.data[index]);
          count += 1;
        }
        motion = total / Math.max(count, 1);
      }
      previous.current = frame;
      const notes = [window.matchMedia("(orientation: portrait)").matches ? "Hold the phone upright." : "Landscape is fine. Keep the sheet in the frame.", "Keep the sheet at the bottom of the frame.", "Sweep slowly from floor to ceiling and overlap each wall."];
      if (blur < 40) notes.unshift("Frame looks soft. Pause and let the sheet sharpen.");
      if (motion > 28) notes.unshift("Moving too fast. Slow the pan.");
      if (navigator.onLine === false) {
        notes.unshift("No signal. Still recording. The sheet check waits.");
        setCoach(notes[0]);
        return;
      }
      try {
        const blob = await new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, "image/jpeg", 0.7));
        if (blob) {
          const response = await fetch("/api/measure/target", { method: "POST", body: blob, signal: AbortSignal.timeout(1500) });
          const payload = await response.json();
          if (!payload.readable) notes.unshift(payload.note ?? "The sheet is not readable in this frame.");
          else notes.unshift("Sheet is readable. Keep it in view while you show the next wall.");
        }
      } catch {
        notes.unshift("Live sheet check did not return. Recording continues on this phone.");
      }
      setCoach(notes[0]);
    }, 900);
    return () => window.clearInterval(timer);
  }, [recording]);

  function stopMeter() {
    if (meterFrame.current != null) cancelAnimationFrame(meterFrame.current);
    meterFrame.current = null;
    void audioContext.current?.close();
    audioContext.current = null;
    setMicLevel(0);
  }

  function watchMic(stream: MediaStream) {
    const track = stream.getAudioTracks()[0];
    if (!track) {
      setMicNote("Mic is off. Video still records. The level stays empty.");
      return;
    }
    const context = new AudioContext();
    audioContext.current = context;
    const analyser = context.createAnalyser();
    analyser.fftSize = 256;
    context.createMediaStreamSource(new MediaStream([track])).connect(analyser);
    const samples = new Uint8Array(analyser.fftSize);
    const tick = () => {
      analyser.getByteTimeDomainData(samples);
      let sum = 0;
      for (const value of samples) {
        const sample = (value - 128) / 128;
        sum += sample * sample;
      }
      setMicLevel(Math.min(1, Math.sqrt(sum / samples.length) * 4));
      meterFrame.current = requestAnimationFrame(tick);
    };
    setMicNote("Mic is live.");
    tick();
  }

  async function startCamera() {
    setError(null);
    if (!navigator.mediaDevices?.getUserMedia) {
      setError("This browser has no camera. Upload a video instead. Nothing was recorded.");
      return;
    }
    let stream: MediaStream;
    try {
      stream = await navigator.mediaDevices.getUserMedia({ video: { facingMode: "environment" }, audio: true });
    } catch {
      try {
        stream = await navigator.mediaDevices.getUserMedia({ video: { facingMode: "environment" }, audio: false });
        setMicNote("Mic is off. Video still records. The level stays empty.");
      } catch (caught) {
        setError(caught instanceof Error ? caught.message : "The camera did not start.");
        return;
      }
    }
    if (videoRef.current) {
      videoRef.current.srcObject = stream;
      videoRef.current.muted = true;
      await videoRef.current.play();
    }
    watchMic(stream);
    chunks.current = [];
    const id = crypto.randomUUID();
    captureId.current = id;
    saveChain.current = putCapture({
      id,
      filename: "walkthrough.webm",
      mime: "video/webm",
      createdAt: new Date().toISOString(),
      status: "recording",
      totalChunks: 0,
      uploadId: null,
      error: null,
    });
    const media = new MediaRecorder(stream);
    recorder.current = media;
    media.ondataavailable = (event) => {
      if (event.data.size === 0) return;
      const index = chunks.current.length;
      chunks.current.push(event.data);
      saveChain.current = saveChain.current.then(() => saveChunk(id, index, event.data));
    };
    media.start(1000);
    setRecording(true);
    setUploadStatus(captureStatusLabel({ online: navigator.onLine, phase: "recording", sent: 0, total: 0 }));
    setCoach("Slow pan. Show every corner. Sweep floor to ceiling. Keep the sheet in the lower frame.");
  }

  async function finishRecording() {
    const media = recorder.current;
    if (!media) return;
    const blob = await new Promise<Blob>((resolve) => {
      media.onstop = () => resolve(new Blob(chunks.current, { type: media.mimeType || "video/webm" }));
      media.stop();
    });
    stopMeter();
    videoRef.current?.srcObject && (videoRef.current.srcObject as MediaStream).getTracks().forEach((track) => track.stop());
    setRecording(false);
    const id = captureId.current;
    await saveChain.current;
    if (id) {
      const existing = await getCapture(id);
      if (existing) await putCapture({ ...existing, status: "saved", totalChunks: chunks.current.length, mime: blob.type || existing.mime });
      await uploadCapture(id);
      return;
    }
    await submitVideo(blob, "walkthrough.webm");
  }

  async function uploadCapture(id: string) {
    setBusy(true);
    setError(null);
    try {
      const record = await getCapture(id);
      if (!record || record.totalChunks < 1) throw new Error("The recording was not saved on this phone.");
      const body = await resumeCapture(record, { online: navigator.onLine, onStatus: (label) => {
        setUploadStatus(label);
        const match = label.match(/Uploading (\d+) of (\d+)/);
        setProgress(match ? { sent: Number(match[1]), total: Number(match[2]) } : null);
        setSignal(readSignal());
      } });
      if (body && typeof body === "object") {
        const measured = body as SolverResult;
        const plan = planFromResult(measured);
        setResult(measured);
        if (!measured.error && measured.dimensions) {
          const names = (measured.ai?.objects ?? []).map((object) => object.name);
          const narration = notesFromNarration(measured.ai?.transcription.text ?? null, names);
          const assist: AssistState = {
            acceptedIds: [],
            skippedIds: [],
            conditions: narration.filter((note) => note.note === "salvageable").map((note) => ({ target: note.target, value: note.note })),
            renames: narration.filter((note) => note.target === "Flooring").map((note) => ({ from: "Flooring", to: note.note })),
            notes: [],
            added: [],
            log: [],
          };
          saveWalkthrough({
            savedAt: new Date().toISOString(),
            source: "measurement",
            transcript: measured.ai?.transcription.text ?? null,
            transcriptNote: measured.ai?.transcription.note ?? "No narration text was returned.",
            plan,
            videoPlan: plan,
            objects: (measured.ai?.objects ?? []).map((object) => ({ ...object, confidence: object.confidence === "high" || object.confidence === "medium" || object.confidence === "low" ? object.confidence : "low" })),
            offers: (measured.ai?.offers ?? []).map((offer) => ({ query: offer.query, title: offer.title, retailer: offer.retailer, price: offer.price, currency: offer.currency, url: offer.url, status: offer.status, note: offer.note })),
            videoKey: measured.videoKey ?? null,
            assist,
          });
          router.push("/review");
        }
      }
    } catch (caught) {
      const message = caught instanceof Error ? caught.message : "Upload failed.";
      setUploadStatus(captureStatusLabel({ online: navigator.onLine, phase: "error", sent: 0, total: 0 }));
      setError(message);
      const record = await getCapture(id);
      if (record) await putCapture({ ...record, status: "error", error: message });
    } finally {
      setBusy(false);
      setQueue(await listPendingCaptures().catch(() => []));
    }
  }

  async function retryUploads() {
    const pending = await listPendingCaptures();
    setQueue(pending);
    if (!navigator.onLine) {
      setSignal("offline");
      setUploadStatus(captureStatusLabel({ online: false, phase: "saved", sent: 0, total: pending[0]?.totalChunks ?? 0 }));
      return;
    }
    if (readSignal() === "weak") setSignal("weak");
    if (pending.length === 0) {
      setUploadStatus("Nothing is waiting on this phone.");
      return;
    }
    await flushPending();
  }

  async function flushPending() {
    try {
      const pending = await listPendingCaptures();
      setQueue(pending);
      for (const record of pending) {
        const count = await chunkCount(record.id);
        if (count < 1) continue;
        if (!navigator.onLine) {
          setUploadStatus(captureStatusLabel({ online: false, phase: "saved", sent: 0, total: count }));
          return;
        }
        if (record.totalChunks !== count || record.status === "recording") {
          await putCapture({ ...record, totalChunks: count, status: "saved" });
        }
        await uploadCapture(record.id);
      }
    } catch {
      setUploadStatus("Saved recordings could not be read on this phone.");
    }
  }

  async function submitVideo(blob: Blob, filename: string) {
    setBusy(true);
    setError(null);
    try {
      const id = crypto.randomUUID();
      const parts = sliceBlob(blob);
      await putCapture({
        id,
        filename,
        mime: blob.type || "video/mp4",
        createdAt: new Date().toISOString(),
        status: "saved",
        totalChunks: parts.length,
        uploadId: null,
        error: null,
      });
      for (let index = 0; index < parts.length; index += 1) await saveChunk(id, index, parts[index]);
      await uploadCapture(id);
    } catch {
      setError("The video could not be saved on this phone.");
      setBusy(false);
    }
  }

  const fused: { raw: SolverDimension; fused: FusedDimension }[] = (result?.dimensions ?? []).map((dimension) => {
    const readings: Reading[] = [
      {
        source: sourceForMethod(result?.method ?? "none"),
        valueFt: dimension.valueFt,
        errorPercent: dimension.errorPercent,
        instrumentLock: false,
      },
    ];
    const tape = Number(tapeValue);
    if (tapeLabel === dimension.label && Number.isFinite(tape) && tape > 0) {
      readings.push({ source: "tape", valueFt: tape, errorPercent: 1, instrumentLock: true });
    }
    return { raw: dimension, fused: fuseDimension(readings) };
  });

  const step = result ? 3 : recording ? 2 : 1;
  const showQueue = queue.length > 0 || busy || Boolean(error) || signal !== "online";
  const tapeOptions = result?.dimensions?.length ? result.dimensions : [{ label: "span_a" }, { label: "span_b" }, { label: "height" }, { label: "area" }];

  return (
    <div className="flow">
      <ol className="steps">
        <li data-current={step === 1 ? "true" : undefined}>Place the sheet</li>
        <li data-current={step === 2 ? "true" : undefined}>Record</li>
        <li data-current={step === 3 ? "true" : undefined}>Done</li>
      </ol>
      <section className={`capture-stage ${recording ? "is-recording" : ""}`}>
        <div className="capture-video">
          <video ref={videoRef} playsInline muted />
          <div className="capture-overlay">
            <p className="rec-indicator" role="status">
              <span className="rec-dot" aria-hidden="true" />
              {recording ? "Recording" : result ? "Done" : "Ready"}
            </p>
            {!recording && !result && (
              <div className="capture-overlay-copy">
                <p className="sheet-reminder">Place the sheet on the floor.</p>
                <a className="btn secondary" href="/api/calibration-target">Sheet PDF</a>
              </div>
            )}
            {recording && (
              <div className="capture-overlay-copy">
                <div className="mic-meter" role="meter" aria-valuemin={0} aria-valuemax={100} aria-valuenow={Math.round(micLevel * 100)} aria-label="Microphone level">
                  <span style={{ width: `${Math.round(micLevel * 100)}%` }} />
                </div>
                <p className="coach">{coach || micNote}</p>
              </div>
            )}
          </div>
        </div>
        <div className="action-bar">
          {result ? (
            <Link className="btn record-btn" href="/review">Review draft</Link>
          ) : !recording ? (
            <button className="btn record-btn" type="button" onClick={() => void startCamera()}>Record</button>
          ) : (
            <button className="btn stop-btn" type="button" onClick={() => void finishRecording()}>Stop</button>
          )}
          {!result && (
            <label className="btn secondary">
              Upload
              <input
                type="file"
                accept="video/*"
                hidden
                onChange={(event) => {
                  const file = event.target.files?.[0];
                  if (file) void submitVideo(file, file.name);
                }}
              />
            </label>
          )}
        </div>
      </section>
      {busy && (
        <ol className="steps" aria-live="polite">
          <li data-current={processStep === 0 ? "true" : undefined}>Measuring walls</li>
          <li data-current={processStep === 1 ? "true" : undefined}>Finding items</li>
          <li data-current={processStep === 2 ? "true" : undefined}>Pricing</li>
        </ol>
      )}
      {showQueue && (
        <section className="upload-queue" aria-live="polite">
          <p className="meta">{signal === "offline" ? "Offline. The video stays on this phone." : signal === "weak" ? "Weak signal. The upload will retry." : uploadStatus}</p>
          {progress && <progress max={progress.total} value={progress.sent}>{progress.sent} of {progress.total}</progress>}
          <ul className="list">
            {queue.map((item) => (
              <li key={item.id} className="item">
                <strong>{item.filename}</strong>
                <span className="meta"> {item.status}</span>
              </li>
            ))}
          </ul>
          {queue.length > 0 && <button className="btn secondary" type="button" onClick={() => void retryUploads()} disabled={busy || recording}>Retry upload</button>}
          {error && <p className="error">{error}</p>}
        </section>
      )}
      <details className="quiet">
        <summary>Tape check</summary>
        <div className="row">
          <label className="field">Dimension
            <select value={tapeLabel} onChange={(event) => setTapeLabel(event.target.value)}>
              {tapeOptions.map((dimension) => (
                <option key={dimension.label} value={dimension.label}>{dimensionLabel(dimension.label)}</option>
              ))}
            </select>
          </label>
          <label className="field">Feet
            <input value={tapeValue} onChange={(event) => setTapeValue(event.target.value)} inputMode="decimal" placeholder="14.0" />
          </label>
        </div>
        <p className="meta">If the tape and the sheet disagree by more than 5%, it stays not verified.</p>
      </details>
      {fused.length > 0 && (
        <table className="stack">
          <thead>
            <tr><th>Dimension</th><th>Value</th><th>Status</th></tr>
          </thead>
          <tbody>
            {fused.map(({ raw, fused: item }) => (
              <tr key={raw.label}>
                <td data-label="Dimension">{dimensionLabel(raw.label)}</td>
                <td data-label="Value">{item.valueFt == null ? "—" : `${item.valueFt} ${raw.kind === "floor_area" ? "sq ft" : "ft"}`}</td>
                <td data-label="Status">{item.confirmed ? <span className="chip blue">Verified</span> : <span className="chip orange">Not verified</span>}</td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </div>
  );
}
