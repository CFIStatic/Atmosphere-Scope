"use client";

import { useEffect, useState } from "react";
import { loadWalkthrough, saveWalkthrough, type WalkthroughSnapshot } from "@/capture/snapshot";
import type { AssistDiff, AssistProposal } from "@/domain/assist";

export function CommandBar({ snapshot, onSnapshot }: { snapshot: WalkthroughSnapshot | null; onSnapshot?: (next: WalkthroughSnapshot) => void }) {
  const [prompt, setPrompt] = useState("");
  const [proposal, setProposal] = useState<AssistProposal | null>(null);
  const [diffs, setDiffs] = useState<AssistDiff[]>([]);
  const [notice, setNotice] = useState<string | null>(null);
  const [admin, setAdmin] = useState(false);
  const [pending, setPending] = useState(false);
  const [listening, setListening] = useState(false);

  useEffect(() => {
    void fetch("/api/auth/session").then(async (response) => {
      const body = await response.json();
      setAdmin(body.session?.role === "admin");
    }).catch(() => undefined);
  }, []);

  async function ask(text: string) {
    const current = snapshot ?? loadWalkthrough();
    if (!current || !text.trim()) return;
    setPending(true);
    setNotice(null);
    const response = await fetch("/api/assist", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ prompt: text, snapshot: current }),
    });
    const body = await response.json();
    setPending(false);
    setProposal(body.proposal ?? null);
    setDiffs(body.diffs ?? []);
    if (admin && body.notice) setNotice(body.notice);
  }

  async function apply() {
    const current = snapshot ?? loadWalkthrough();
    if (!current || !proposal) return;
    setPending(true);
    const response = await fetch("/api/assist", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ confirm: true, prompt, proposal, snapshot: current }),
    });
    const body = await response.json();
    setPending(false);
    if (!response.ok || !body.snapshot) return;
    saveWalkthrough(body.snapshot);
    onSnapshot?.(body.snapshot);
    setProposal(null);
    setDiffs([]);
    setPrompt("");
  }

  async function listen() {
    const current = snapshot ?? loadWalkthrough();
    if (!current || listening) return;
    const stream = await navigator.mediaDevices.getUserMedia({ audio: true }).catch(() => null);
    if (!stream) return;
    setListening(true);
    const recorder = new MediaRecorder(stream);
    const chunks: Blob[] = [];
    recorder.ondataavailable = (event) => { if (event.data.size) chunks.push(event.data); };
    const stopped = new Promise<Blob>((resolve) => {
      recorder.onstop = () => resolve(new Blob(chunks, { type: recorder.mimeType || "audio/webm" }));
    });
    recorder.start();
    window.setTimeout(() => recorder.stop(), 4000);
    const blob = await stopped;
    stream.getTracks().forEach((track) => track.stop());
    setListening(false);
    const bytes = new Uint8Array(await blob.arrayBuffer());
    let binary = "";
    bytes.forEach((value) => { binary += String.fromCharCode(value); });
    const response = await fetch("/api/assist", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ audioBase64: btoa(binary), mime: blob.type }),
    });
    const body = await response.json();
    if (admin && body.notice) setNotice(body.notice);
    if (typeof body.text === "string" && body.text) {
      setPrompt(body.text);
      await ask(body.text);
    }
  }

  return (
    <section className="grid">
      <form className="command-bar" onSubmit={(event) => { event.preventDefault(); void ask(prompt); }}>
        <input aria-label="Instruction" placeholder="Instruction" value={prompt} onChange={(event) => setPrompt(event.target.value)} />
        <button className="btn secondary icon-btn" type="button" aria-label="Microphone" onClick={() => void listen()}>
          <svg width="16" height="16" viewBox="0 0 16 16" aria-hidden="true">
            <rect x="6" y="1" width="4" height="8" rx="2" fill="none" stroke="currentColor" strokeWidth="1.2" />
            <path d="M3.5 7.5a4.5 4.5 0 0 0 9 0M8 12v2.5" fill="none" stroke="currentColor" strokeWidth="1.2" />
          </svg>
        </button>
        <button className="sr-submit" type="submit" disabled={pending || !prompt.trim()}>Submit</button>
      </form>
      {notice && <p className="meta">{notice}</p>}
      {proposal && diffs.length > 0 && (
        <div className="grid">
          <table className="data">
            <thead><tr><th>Change</th><th>Before</th><th>After</th></tr></thead>
            <tbody>
              {diffs.map((diff) => (
                <tr key={`${diff.summary}-${diff.before}`}>
                  <td data-label="Change">{diff.summary}</td>
                  <td data-label="Before">{diff.before || "—"}</td>
                  <td data-label="After">{diff.after || "—"}</td>
                </tr>
              ))}
            </tbody>
          </table>
          {proposal.answer && <p>{proposal.answer}</p>}
          {proposal.unknown && <p className="meta">{proposal.unknown}</p>}
          <div className="row">
            <button className="btn" type="button" disabled={pending || diffs.every((diff) => diff.blocked)} onClick={() => void apply()}>Apply</button>
            <button className="btn secondary" type="button" onClick={() => { setProposal(null); setDiffs([]); }}>Dismiss</button>
          </div>
        </div>
      )}
      {proposal && diffs.length === 0 && (proposal.answer || proposal.unknown) && (
        <p>{proposal.answer ?? proposal.unknown}</p>
      )}
    </section>
  );
}
