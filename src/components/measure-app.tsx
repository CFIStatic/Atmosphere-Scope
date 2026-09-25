"use client";

import { useEffect, useRef, useState } from "react";
import { fuseDimension, type FusedDimension, type Reading, type ScaleSource } from "@/domain/fusion";

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

type SolverResult = {
  method: string;
  framesUsed?: number;
  calibrationRmsPx?: number | null;
  notes?: string[];
  dimensions: SolverDimension[];
  error?: string;
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

export function MeasureApp() {
  const videoRef = useRef<HTMLVideoElement>(null);
  const [sensors, setSensors] = useState<SensorState>({ webxr: "checking", bluetooth: "checking", laser: null });
  const [coach, setCoach] = useState("Print the sheet, put it on the floor, and start the camera.");
  const [recording, setRecording] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<SolverResult | null>(null);
  const [tapeLabel, setTapeLabel] = useState("span_a");
  const [tapeValue, setTapeValue] = useState("");
  const recorder = useRef<MediaRecorder | null>(null);
  const chunks = useRef<Blob[]>([]);
  const previous = useRef<ImageData | null>(null);

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
      try {
        const blob = await new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, "image/jpeg", 0.7));
        if (blob) {
          const response = await fetch("/api/measure/target", { method: "POST", body: blob });
          const payload = await response.json();
          if (!payload.readable) notes.unshift(payload.note ?? "The sheet is not readable in this frame.");
          else notes.unshift("Sheet is readable. Keep it in view while you show the next wall.");
        }
      } catch {
        notes.unshift("Live sheet check did not return. Keep the sheet large in frame.");
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
    const media = new MediaRecorder(stream);
    recorder.current = media;
    media.ondataavailable = (event) => {
      if (event.data.size > 0) chunks.current.push(event.data);
    };
    media.start(500);
    setRecording(true);
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
    await submitVideo(blob, "walkthrough.webm");
  }

  async function submitVideo(blob: Blob, filename: string) {
    setBusy(true);
    setError(null);
    try {
      const body = new FormData();
      body.set("video", blob, filename);
      const response = await fetch("/api/measure", { method: "POST", body });
      const payload = (await response.json()) as SolverResult;
      if (!response.ok) {
        setError(payload.error ?? "Measurement failed.");
        setResult(null);
        return;
      }
      setResult(payload);
    } catch {
      setError("Measurement request failed.");
    } finally {
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
          {busy && <p className="meta">Measuring keyframes…</p>}
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
      </section>
    </div>
  );
}
