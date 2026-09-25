"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { chunkCount, getCapture, listPendingCaptures, putCapture, saveChunk } from "@/capture/db";
import { captureStatusLabel } from "@/capture/plan";
import { resumeCapture } from "@/capture/resume-client";
import { fuseDimension, type FusedDimension, type Reading, type ScaleSource } from "@/domain/fusion";
import { saveWalkthrough } from "@/capture/snapshot";
import { floorPlanFromMeasurement, recordedSyntheticRoom, type FloorPlan, type MeasuredRoomInput } from "@/domain/plan-from-measurement";
import type { IdentifiedObject } from "@/analysis/frames";
import type { ResultOffer } from "@/domain/results";
import { PlanView } from "@/components/plan-view";
import { ResultsView } from "@/components/results-view";

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
  ai?: {
    transcription: { status: string; text: string | null; note: string };
    objects: { name: string; room: string | null; evidence: string; confidence: string; frames: string[]; links?: { frame: string; timeMs: number | null }[] }[];
    objectNote: string;
    offers: Offer[];
    pricing: { reason: string };
    measurement: { note: string };
  };
};

type SensorState = {
  webxr: "checking" | "supported" | "unsupported";
  bluetooth: "checking" | "supported" | "unsupported";
  laser: string | null;
};

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

const recordedObjects: IdentifiedObject[] = [{
  name: "AA alkaline batteries",
  room: "Recorded fixture",
  evidence: "Recorded model response. Not a photo from this phone.",
  confidence: "low",
  frames: ["frame_02.jpg"],
  links: [{ frame: "frame_02.jpg", timeMs: 1000 }],
}];

const recordedOffers: ResultOffer[] = [
  { query: "AA alkaline batteries", title: "AA alkaline batteries", retailer: "Example", price: 12.99, currency: "USD", url: "https://shop.example/batteries", status: "unverified", note: "Recorded model response. The retailer page was not fetched." },
  { query: "AA alkaline batteries", title: "Other pack", retailer: "Example", price: 9.5, currency: "USD", url: "https://shop.example/other", status: "unverified", note: "Second recorded candidate. The retailer page was not fetched." },
];

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

export function MeasureApp({ setup }: { setup: { measurement: string; vision: string; pricing: string } }) {
  const router = useRouter();
  const videoRef = useRef<HTMLVideoElement>(null);
  const [sensors, setSensors] = useState<SensorState>({ webxr: "checking", bluetooth: "checking", laser: null });
  const [coach, setCoach] = useState("Print the sheet, put it on the floor, and start the camera.");
  const [recording, setRecording] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<SolverResult | null>(null);
  const [plan, setPlan] = useState<FloorPlan | null>(null);
  const [previewObjects, setPreviewObjects] = useState<IdentifiedObject[]>([]);
  const [previewOffers, setPreviewOffers] = useState<ResultOffer[]>([]);
  useEffect(() => {
    if (!plan) return;
    const objects: IdentifiedObject[] = (result?.ai?.objects ?? previewObjects).map((object) => {
      const confidence: IdentifiedObject["confidence"] = object.confidence === "high" || object.confidence === "medium" ? object.confidence : "low";
      return { ...object, confidence };
    });
    const offers = (result?.ai?.offers ?? previewOffers).map((offer) => ({
      query: offer.query,
      title: offer.title,
      retailer: offer.retailer,
      price: offer.price,
      currency: offer.currency,
      url: offer.url,
      status: offer.status,
      note: offer.note,
    }));
    saveWalkthrough({
      savedAt: new Date().toISOString(),
      source: result ? "measurement" : "recorded-preview",
      transcript: result?.ai?.transcription.text ?? null,
      transcriptNote: result?.ai?.transcription.note ?? "Recorded preview. Not a customer recording.",
      plan,
      videoPlan: result ? plan : null,
      objects,
      offers,
    });
  }, [plan, result, previewObjects, previewOffers]);
  const [tapeLabel, setTapeLabel] = useState("span_a");
  const [tapeValue, setTapeValue] = useState("");
  const [online, setOnline] = useState(true);
  const [uploadStatus, setUploadStatus] = useState("Capture stays on this phone if the signal drops. Measurement runs on the server.");
  const recorder = useRef<MediaRecorder | null>(null);
  const chunks = useRef<Blob[]>([]);
  const captureId = useRef<string | null>(null);
  const saveChain = useRef(Promise.resolve());
  const previous = useRef<ImageData | null>(null);

  useEffect(() => {
    setOnline(navigator.onLine);
    const markOnline = () => {
      setOnline(true);
      void flushPending();
    };
    const markOffline = () => {
      setOnline(false);
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
    let cancelled = false;
    async function detect() {
      const bluetooth = typeof navigator !== "undefined" && "bluetooth" in navigator ? "supported" : "unsupported";
      let webxr: SensorState["webxr"] = "unsupported";
      const xr = navigator.xr;
      if (xr?.isSessionSupported) {
        try {
          webxr = (await xr.isSessionSupported("immersive-ar")) ? "supported" : "unsupported";
        } catch {
          webxr = "unsupported";
        }
      }
      if (!cancelled) setSensors({ webxr, bluetooth, laser: null });
    }
    void detect();
    return () => {
      cancelled = true;
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
      const notes = ["Hold the phone upright.", "Keep the sheet at the bottom of the frame.", "Sweep slowly from floor to ceiling and overlap each wall."];
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

  async function startCamera() {
    setError(null);
    const stream = await navigator.mediaDevices.getUserMedia({ video: { facingMode: "environment" }, audio: false });
    if (videoRef.current) {
      videoRef.current.srcObject = stream;
      await videoRef.current.play();
    }
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
      const body = await resumeCapture(record, { online: navigator.onLine, onStatus: setUploadStatus });
      if (body && typeof body === "object") {
        const measured = body as SolverResult;
        const plan = planFromResult(measured);
        setResult(measured);
        setPlan(plan);
        if (!measured.error && measured.dimensions) {
          saveWalkthrough({
            savedAt: new Date().toISOString(),
            source: "measurement",
            transcript: measured.ai?.transcription.text ?? null,
            transcriptNote: measured.ai?.transcription.note ?? "No narration text was returned.",
            plan,
            videoPlan: plan,
            objects: (measured.ai?.objects ?? []).map((object) => ({ ...object, confidence: object.confidence === "high" || object.confidence === "medium" || object.confidence === "low" ? object.confidence : "low" })),
            offers: (measured.ai?.offers ?? []).map((offer) => ({ query: offer.query, title: offer.title, retailer: offer.retailer, price: offer.price, currency: offer.currency, url: offer.url, status: offer.status, note: offer.note })),
          });
          router.push("/contents");
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
    }
  }

  async function flushPending() {
    try {
      const pending = await listPendingCaptures();
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

  async function connectLaser() {
    const bluetooth = (navigator as Navigator & { bluetooth?: { requestDevice: (options: { acceptAllDevices?: boolean; optionalServices?: string[] }) => Promise<{ name?: string }> } }).bluetooth;
    if (!bluetooth) {
      setSensors((current) => ({ ...current, bluetooth: "unsupported", laser: null }));
      return;
    }
    try {
      const device = await bluetooth.requestDevice({
        acceptAllDevices: true,
        optionalServices: ["battery_service"],
      });
      setSensors((current) => ({
        ...current,
        laser: device.name
          ? `Connected to ${device.name}. This build does not decode a distance until the meter sends a numeric reading, so nothing is locked yet.`
          : "A device connected, but it did not expose a distance reading. Nothing was locked.",
      }));
    } catch {
      setSensors((current) => ({ ...current, laser: "Laser connection was cancelled. No distance was invented." }));
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

  return (
    <div className="flow">
      <section className="panel">
        <p className="kicker">This server</p>
        <p className="meta">{setup.measurement}</p>
        <p className="meta">{setup.vision}</p>
        <p className="meta">{setup.pricing}</p>
      </section>
      <section className="panel">
        <p className="kicker">Calibration sheet</p>
        <p>Print the letter sheet at 100% scale and lay it on the floor before you walk the room. The 30 mm square is the only absolute scale this solver trusts.</p>
        <a className="btn" href="/api/calibration-target">Download letter PDF</a>
      </section>
      <section className="split">
        <div className="phone">
          <div className="phone-top">
            <span>{recording ? "REC" : "READY"}</span>
            <span>ROOM</span>
          </div>
          <video ref={videoRef} playsInline muted />
          <p className="coach">{coach}</p>
          <div className="row">
            {!recording ? (
              <button className="btn" type="button" onClick={() => void startCamera()}>Open camera</button>
            ) : (
              <button className="btn" type="button" onClick={() => void finishRecording()}>Stop and measure</button>
            )}
            <label className="btn secondary">
              Upload video
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
          </div>
          <p className="meta" role="status">{uploadStatus}{online ? "" : " Offline."}</p>
          {busy && <p className="meta">Measurement runs on the server after the upload.</p>}
          {error && <p className="error">{error}</p>}
        </div>
        <div className="panel">
          <p className="kicker">Device sensors</p>
          <p><span className="chip">WebXR</span> {sensors.webxr === "supported" ? "Hit-test is available. A hit is still estimated until a tape or laser locks it, and this build has no accuracy result for WebXR, so it cannot meet ±5%." : "Not available in this browser. iOS Safari does not expose WebXR depth. Measurement continues from the sheet, or stays unresolved."}</p>
          <p><span className="chip">Bluetooth laser</span> {sensors.bluetooth === "supported" ? "Web Bluetooth is present. A spot check can lock a dimension only after a numeric reading arrives." : "Not available in this browser. iOS Safari has no Web Bluetooth. Enter a tape reading instead."}</p>
          {sensors.bluetooth === "supported" && <button className="btn secondary" type="button" onClick={() => void connectLaser()}>Connect laser</button>}
          {sensors.laser && <p className="meta">{sensors.laser}</p>}
        </div>
      </section>
      <section className="panel">
        <p className="kicker">Lock one dimension with a tape</p>
        <div className="row">
          <label className="field">Dimension
            <select value={tapeLabel} onChange={(event) => setTapeLabel(event.target.value)}>
              {(result?.dimensions ?? [{ label: "span_a" }, { label: "span_b" }, { label: "height" }, { label: "area" }]).map((dimension) => (
                <option key={dimension.label} value={dimension.label}>{dimension.label}</option>
              ))}
            </select>
          </label>
          <label className="field">Tape, feet
            <input value={tapeValue} onChange={(event) => setTapeValue(event.target.value)} inputMode="decimal" placeholder="14.0" />
          </label>
        </div>
        <p className="meta">If the tape and the sheet disagree by more than 5%, the value is not confirmed.</p>
      </section>
      <section className="panel">
        <p className="kicker">Floor plan</p>
        <div className="row">
          <button className="btn secondary" type="button" onClick={() => setPlan(floorPlanFromMeasurement([recordedSyntheticRoom], "Synthetic pinhole harness. Not a recording from this phone."))}>Preview recorded synthetic room</button>
          <button className="btn secondary" type="button" onClick={() => { setPreviewObjects(recordedObjects); setPreviewOffers(recordedOffers); }}>Preview recorded price</button>
        </div>
        {plan ? <PlanView plan={plan} onChange={setPlan} /> : <p className="meta">No outline yet. A measured wall is drawn only after the solver returns a length.</p>}
        {plan && <ResultsView plan={plan} objects={(result?.ai?.objects ?? previewObjects).map((object) => ({ ...object, confidence: object.confidence === "high" || object.confidence === "medium" ? object.confidence : "low" }))} offers={(result?.ai?.offers ?? previewOffers).map((offer) => ({ query: offer.query, title: offer.title, retailer: offer.retailer, price: offer.price, currency: offer.currency, url: offer.url, status: offer.status, note: offer.note }))} />}
      </section>
      <section className="panel">
        <p className="kicker">Dimensions</p>
        {!result && <p className="meta">No measurement yet. A number is not shown as confirmed just because a video was uploaded.</p>}
        {result?.notes?.map((note) => <p key={note} className="meta">{note}</p>)}
        {fused.length > 0 && (
          <table>
            <thead>
              <tr><th>Dimension</th><th>Value</th><th>Error bound</th><th>Target</th><th>Status</th></tr>
            </thead>
            <tbody>
              {fused.map(({ raw, fused: item }) => (
                <tr key={raw.label}>
                  <td>{raw.kind.replaceAll("_", " ")} · {raw.label}</td>
                  <td>{item.valueFt == null ? "?" : `${item.valueFt} ${raw.kind === "floor_area" ? "sq ft" : "ft"}`}</td>
                  <td>{item.errorPercent == null ? "?" : `±${item.errorPercent}%`}</td>
                  <td>{item.meetsAccuracyTarget ? <span className="chip blue">Meets ±5%</span> : <span className="chip orange">Does not meet ±5%</span>}</td>
                  <td>{item.confirmed ? <span className="chip blue">Confirmed</span> : <span className="chip">Not confirmed</span>}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
        {fused.find((item) => item.fused.ask) && <p className="banner">{fused.find((item) => item.fused.ask)?.fused.ask}</p>}
        {result?.cpuMs != null && (
          <p className="meta">Local CPU time {(result.cpuMs / 1000).toFixed(1)} s (extract {(result.extractMs ?? 0) / 1000} s, solve {(result.solveMs ?? 0) / 1000} s). OpenCV on this server, not a GPU API. At most 16 frames are solved.</p>
        )}
        {result?.ai && <p className="meta">{result.ai.measurement.note}</p>}
      </section>
      {result?.ai && (
        <>
          <section className="panel">
            <p className="kicker">Narration</p>
            <p>{result.ai.transcription.text ?? result.ai.transcription.note}</p>
            {result.ai.transcription.text && <p className="meta">{result.ai.transcription.note}</p>}
          </section>
          <section className="panel">
            <p className="kicker">Objects</p>
            <p className="meta">{result.ai.objectNote}</p>
            {result.ai.objects.length > 0 && (
              <table>
                <thead><tr><th>Name</th><th>Room</th><th>Confidence</th><th>Evidence</th></tr></thead>
                <tbody>
                  {result.ai.objects.map((object) => (
                    <tr key={object.name}>
                      <td>{object.name}</td>
                      <td>{object.room ?? "?"}</td>
                      <td>{object.confidence}</td>
                      <td>{object.evidence || "—"} <span className="meta">{(object.links?.length ? object.links : object.frames.map((frame) => ({ frame, timeMs: null }))).map((link) => `${link.frame}${link.timeMs == null ? "" : ` @ ${(link.timeMs / 1000).toFixed(1)}s`}`).join(", ")}</span></td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </section>
          <section className="panel">
            <p className="kicker">Replacement offers</p>
            <p className="meta">{result.ai.pricing.reason} Offers are candidates. They are not written into the estimate.</p>
            {result.ai.offers.length > 0 && (
              <table>
                <thead><tr><th>Item</th><th>Offer</th><th>Price</th><th>Check</th></tr></thead>
                <tbody>
                  {result.ai.offers.map((offer) => (
                    <tr key={offer.query}>
                      <td>{offer.query}</td>
                      <td>{offer.title ?? "—"}{offer.retailer ? ` · ${offer.retailer}` : ""}{offer.url ? <> · <a href={offer.url}>{offer.url}</a></> : null}</td>
                      <td>{offer.price == null ? "—" : `${offer.currency ? `${offer.currency} ` : ""}${offer.price}`}</td>
                      <td>
                        {offer.status === "verified" && <span className="chip blue">Verified</span>}
                        {offer.status === "unverified" && <span className="chip orange">Unverified</span>}
                        {offer.status === "unpriced" && <span className="chip">Unpriced</span>}
                        <span className="meta"> {offer.note}{offer.retrievedAt ? ` Retrieved ${offer.retrievedAt}.` : ""}</span>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </section>
        </>
      )}
    </div>
  );
}
