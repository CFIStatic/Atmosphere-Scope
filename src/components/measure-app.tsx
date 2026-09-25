"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { chunkCount, getCapture, listPendingCaptures, putCapture, saveChunk } from "@/capture/db";
import { captureStatusLabel } from "@/capture/plan";
import { resumeCapture } from "@/capture/resume-client";
import { saveWalkthrough } from "@/capture/snapshot";
import { floorPlanFromMeasurement, type FloorPlan, type MeasuredRoomInput } from "@/domain/plan-from-measurement";
import { notesFromNarration, type AssistState } from "@/domain/assist";
import { suggestFromNarration } from "@/domain/job-identity";

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

type CameraState = "pending" | "live" | "denied" | "missing";
type GeoPoint = { lat: number; lng: number };

function cameraDenied(caught: unknown): boolean {
  const name = caught instanceof Error ? caught.name : "";
  return name === "NotAllowedError" || name === "PermissionDeniedError" || name === "SecurityError";
}

function clock(seconds: number): string {
  const safe = Math.max(0, seconds);
  return `${String(Math.floor(safe / 60)).padStart(2, "0")}:${String(safe % 60).padStart(2, "0")}`;
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
  const [recording, setRecording] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [processStep, setProcessStep] = useState(0);
  const [signal, setSignal] = useState<"online" | "weak" | "offline">("online");
  const [queue, setQueue] = useState<{ id: string; filename: string; status: string; totalChunks: number; error: string | null }[]>([]);
  const [progress, setProgress] = useState<{ sent: number; total: number } | null>(null);
  const [micLevel, setMicLevel] = useState(0);
  const [uploadStatus, setUploadStatus] = useState("");
  const [camera, setCamera] = useState<CameraState>("pending");
  const [sheetSeen, setSheetSeen] = useState(false);
  const [elapsed, setElapsed] = useState(0);
  const audioContext = useRef<AudioContext | null>(null);
  const previewRef = useRef<MediaStream | null>(null);
  const previewRequest = useRef<Promise<MediaStream | null> | null>(null);
  const draftIdRef = useRef<string | null>(null);
  const jobPromise = useRef<Promise<string | null>>(Promise.resolve(null));
  const locationRef = useRef<GeoPoint | null>(null);
  const meterFrame = useRef<number | null>(null);
  const recorder = useRef<MediaRecorder | null>(null);
  const chunks = useRef<Blob[]>([]);
  const captureId = useRef<string | null>(null);
  const saveChain = useRef(Promise.resolve());

  useEffect(() => {
    if (!recording) {
      setElapsed(0);
      return;
    }
    const started = Date.now();
    const timer = window.setInterval(() => setElapsed(Math.floor((Date.now() - started) / 1000)), 250);
    return () => window.clearInterval(timer);
  }, [recording]);

  useEffect(() => {
    if (camera !== "live" || recording || sheetSeen) return;
    let cancel = false;
    const timer = window.setInterval(async () => {
      const video = videoRef.current;
      if (!video || video.videoWidth === 0 || cancel) return;
      const canvas = document.createElement("canvas");
      canvas.width = 160;
      canvas.height = Math.max(1, Math.round((160 * video.videoHeight) / video.videoWidth));
      const context = canvas.getContext("2d");
      if (!context) return;
      context.drawImage(video, 0, 0, canvas.width, canvas.height);
      const blob = await new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, "image/jpeg", 0.6));
      if (!blob || cancel) return;
      try {
        const response = await fetch("/api/measure/target", { method: "POST", body: blob, signal: AbortSignal.timeout(1500) });
        const payload = await response.json();
        if (payload.readable) setSheetSeen(true);
      } catch {
        // The hint stays until the sheet is readable or recording starts.
      }
    }, 1200);
    return () => {
      cancel = true;
      window.clearInterval(timer);
    };
  }, [camera, recording, sheetSeen]);

  useEffect(() => {
    if (!busy) return;
    setProcessStep(0);
    const timer = window.setInterval(() => setProcessStep((step) => Math.min(step + 1, 2)), 900);
    return () => window.clearInterval(timer);
  }, [busy]);

  useEffect(() => {
    let stopped = false;
    let stream: MediaStream | null = null;
    void requestPreview().then((opened) => {
      stream = opened;
      if (stopped && opened) {
        opened.getTracks().forEach((track) => track.stop());
        if (previewRef.current === opened) previewRef.current = null;
      }
    });
    return () => {
      stopped = true;
      stream?.getTracks().forEach((track) => track.stop());
      if (stream && previewRef.current === stream) previewRef.current = null;
    };
  }, []);

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
      const context = canvas.getContext("2d");
      if (!context) return;
      context.drawImage(video, 0, 0, canvas.width, canvas.height);
      if (navigator.onLine === false) return;
      try {
        const blob = await new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, "image/jpeg", 0.7));
        if (!blob) return;
        const response = await fetch("/api/measure/target", { method: "POST", body: blob, signal: AbortSignal.timeout(1500) });
        const payload = await response.json();
        if (payload.readable) setSheetSeen(true);
      } catch {
        // Recording continues when the sheet check does not return.
      }
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
    if (!track) return;
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
    tick();
  }

  function requestPreview(): Promise<MediaStream | null> {
    const current = previewRef.current;
    if (current?.getVideoTracks().some((track) => track.readyState === "live")) return Promise.resolve(current);
    if (previewRequest.current) return previewRequest.current;
    const pending = openPreview().finally(() => {
      if (previewRequest.current === pending) previewRequest.current = null;
    });
    previewRequest.current = pending;
    return pending;
  }

  async function openPreview(): Promise<MediaStream | null> {
    if (!navigator.mediaDevices?.getUserMedia) {
      setCamera("missing");
      return null;
    }
    try {
      const permission = await navigator.permissions?.query({ name: "camera" as PermissionName });
      if (permission?.state === "denied") {
        setCamera("denied");
        return null;
      }
    } catch {
      // The Permissions API is missing in some browsers. The prompt below still runs.
    }
    let stream: MediaStream;
    try {
      stream = await navigator.mediaDevices.getUserMedia({ video: { facingMode: "environment" }, audio: true });
    } catch (caught) {
      if (cameraDenied(caught)) {
        setCamera("denied");
        return null;
      }
      try {
        stream = await navigator.mediaDevices.getUserMedia({ video: { facingMode: "environment" }, audio: false });
      } catch (videoError) {
        setCamera(cameraDenied(videoError) ? "denied" : "missing");
        return null;
      }
    }
    previewRef.current = stream;
    const video = videoRef.current;
    if (video) {
      video.srcObject = stream;
      video.muted = true;
      await video.play().catch(() => undefined);
    }
    setCamera("live");
    return stream;
  }

  function ensureJob(): Promise<string | null> {
    if (draftIdRef.current) return Promise.resolve(draftIdRef.current);
    return fetch("/api/jobs", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ draft: true }),
    }).then(async (response) => {
      if (!response.ok) return null;
      const body = await response.json();
      const id = typeof body.jobId === "string" ? body.jobId : null;
      draftIdRef.current = id;
      return id;
    }).catch(() => null);
  }

  function rememberLocation() {
    if (!navigator.geolocation || locationRef.current) return;
    navigator.geolocation.getCurrentPosition(
      (position) => {
        locationRef.current = { lat: position.coords.latitude, lng: position.coords.longitude };
      },
      () => undefined,
      { enableHighAccuracy: false, timeout: 8000, maximumAge: 60_000 },
    );
  }

  async function startRecording() {
    setError(null);
    const stream = await requestPreview();
    if (!stream) return;
    watchMic(stream);
    chunks.current = [];
    const id = crypto.randomUUID();
    captureId.current = id;
    jobPromise.current = ensureJob();
    rememberLocation();
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
        if (measured.error || !measured.dimensions) {
          setError(measured.error ?? "The measurement did not return dimensions. Nothing was saved.");
        } else {
          const plan = planFromResult(measured);
          const names = (measured.ai?.objects ?? []).map((object) => object.name);
          const transcript = measured.ai?.transcription.text ?? null;
          const narration = notesFromNarration(transcript, names);
          const suggestion = suggestFromNarration(transcript);
          const jobId = await jobPromise.current;
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
            jobId,
            suggestedName: suggestion.name,
            suggestedAddress: suggestion.address,
            location: locationRef.current,
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
    jobPromise.current = ensureJob();
    rememberLocation();
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

  const blocked = camera === "denied" || camera === "missing";
  const showHint = camera === "live" && !recording && !sheetSeen && !busy;
  const showQueue = queue.length > 0 || Boolean(error) || (signal !== "online" && !busy);

  return (
    <div className={`camera-app ${recording ? "is-recording" : ""}`}>
      <video ref={videoRef} playsInline muted />
      {!blocked && (
        <>
          <div className="camera-scrim camera-scrim-top" aria-hidden="true" />
          <div className="camera-scrim camera-scrim-bottom" aria-hidden="true" />
        </>
      )}
      {!blocked && (
        <header className="camera-bar">
          <img className="camera-mark" src="/brand/mark.svg" alt="" width={160} height={180} />
          <p className="camera-title">New walkthrough</p>
          <div className="camera-bar-end">
            {recording && (
              <div className="rec-cluster">
                <p className="rec-status" role="status">
                  <span className="rec-dot" aria-hidden="true" />
                  {clock(elapsed)}
                </p>
                <div className="mic-meter" role="meter" aria-valuemin={0} aria-valuemax={100} aria-valuenow={Math.round(micLevel * 100)} aria-label="Microphone level">
                  <span style={{ width: `${Math.round(micLevel * 100)}%` }} />
                </div>
              </div>
            )}
            <LinkJobs />
          </div>
        </header>
      )}
      {camera === "pending" && <p className="camera-hint">Camera is used to record the walk.</p>}
      {blocked && (
        <div className="camera-fallback">
          <img className="camera-mark" src="/brand/mark.svg" alt="" width={160} height={180} />
          <p>Allow camera access, or open this page on a phone.</p>
        </div>
      )}
      {showHint && <p className="camera-hint">Place the calibration sheet on the floor, then record.</p>}
      {busy && (
        <ol className="process-line" aria-live="polite">
          <li data-current={processStep === 0 ? "true" : undefined}>Measuring walls</li>
          <li data-current={processStep === 1 ? "true" : undefined}>Finding items</li>
          <li data-current={processStep === 2 ? "true" : undefined}>Pricing</li>
        </ol>
      )}
      {!busy && !blocked && camera === "live" && (
        <div className="camera-controls">
          <button
            className="shutter"
            type="button"
            data-recording={recording ? "true" : "false"}
            aria-label={recording ? "Stop" : "Record"}
            onClick={() => void (recording ? finishRecording() : startRecording())}
          >
            <span className="shutter-ring" aria-hidden="true"><span className="shutter-disc" /></span>
          </button>
        </div>
      )}
      {showQueue && (
        <p className="camera-status" role="status">
          {error ?? (signal === "offline" ? "Offline. The video stays on this phone." : signal === "weak" ? "Weak signal. The upload will retry." : uploadStatus)}
          {progress ? ` ${progress.sent} of ${progress.total}` : ""}
          {queue.length > 0 && <button className="camera-side" type="button" onClick={() => void retryUploads()} disabled={busy || recording}>Retry</button>}
        </p>
      )}
    </div>
  );
}

function LinkJobs() {
  return <a className="phone-jobs phone-jobs-inside" href="/jobs">Jobs</a>;
}

