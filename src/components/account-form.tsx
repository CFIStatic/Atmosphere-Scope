"use client";

import { useEffect, useState } from "react";
import { loadWalkthrough, saveWalkthrough, type WalkthroughSnapshot } from "@/capture/snapshot";

type PublicSession = { email: string; name: string; role: "estimator" | "customer" };
type Approval = { status: string; approvedBy: string | null; authorizedBy: string | null; statement: string | null };

export function AccountForm() {
  const [mode, setMode] = useState<"local" | "supabase" | null>(null);
  const [session, setSession] = useState<PublicSession | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [snapshot, setSnapshot] = useState<WalkthroughSnapshot | null>(null);
  const [approval, setApproval] = useState<Approval | null>(null);

  useEffect(() => {
    void fetch("/api/auth/session").then(async (response) => {
      const body = await response.json();
      setMode(body.mode);
      setSession(body.session);
    });
    const saved = loadWalkthrough();
    setSnapshot(saved);
    if (saved?.recordId) {
      void fetch(`/api/walkthroughs/${saved.recordId}`).then(async (response) => {
        if (!response.ok) return;
        const body = await response.json();
        setApproval(body.record?.approval ?? null);
      });
    }
  }, []);

  return (
    <section className="panel grid">
      <p className="kicker">{mode === "supabase" ? "Supabase account" : "Local sign-in"}</p>
      {session ? (
        <>
          <p>{session.name} · {session.email} · {session.role}</p>
          <p className="meta">{session.role === "estimator" ? "An estimator can review and approve. That does not authorize the customer." : "A customer can authorize an approved version. That does not approve it."}</p>
          <button className="btn secondary" type="button" onClick={async () => {
            await fetch("/api/auth/session", { method: "DELETE" });
            setSession(null);
          }}>Sign out</button>
          <WalkthroughActions session={session} snapshot={snapshot} approval={approval} onSnapshot={setSnapshot} onApproval={setApproval} onError={setError} />
          {error && <p className="error">{error}</p>}
        </>
      ) : (
        <form className="grid" onSubmit={async (event) => {
          event.preventDefault();
          setError(null);
          const form = new FormData(event.currentTarget);
          const response = await fetch("/api/auth/session", {
            method: "POST",
            headers: { "content-type": "application/json" },
            body: JSON.stringify({
              name: form.get("name"),
              email: form.get("email"),
              role: form.get("role"),
              password: form.get("password"),
            }),
          });
          const body = await response.json();
          if (!response.ok) {
            setError(body.error ?? "Sign-in failed.");
            return;
          }
          setSession(body.session);
        }}>
          <p className="meta">{mode === "supabase" ? "The password is sent to Supabase and is not stored in this app." : "Local sign-in is for this server only. It is not a Supabase account."}</p>
          <label className="field">Name <input name="name" required /></label>
          <label className="field">Email <input name="email" type="email" required /></label>
          {mode === "supabase" ? <label className="field">Password <input name="password" type="password" required /></label> : (
            <label className="field">Role
              <select name="role" defaultValue="estimator">
                <option value="estimator">Estimator</option>
                <option value="customer">Customer</option>
              </select>
            </label>
          )}
          {error && <p className="error">{error}</p>}
          <button className="btn" type="submit">Sign in</button>
        </form>
      )}
    </section>
  );
}

function WalkthroughActions({
  session,
  snapshot,
  approval,
  onSnapshot,
  onApproval,
  onError,
}: {
  session: PublicSession;
  snapshot: WalkthroughSnapshot | null;
  approval: Approval | null;
  onSnapshot: (snapshot: WalkthroughSnapshot) => void;
  onApproval: (approval: Approval | null) => void;
  onError: (message: string | null) => void;
}) {
  if (!snapshot) return <p className="meta">No walkthrough is saved in this browser. Nothing was stored on the server.</p>;
  return (
    <div className="grid">
      <p className="kicker">Saved walkthrough</p>
      <p className="meta">{approval ? `Status: ${approval.status}` : "Not stored on the server yet."}{snapshot.videoKey ? ` Video: ${snapshot.videoKey}` : " No video file is attached."}{snapshot.finalReport ? ` Report ${snapshot.finalReport.id}` : " The estimate is not finalized."}</p>
      <button className="btn" type="button" onClick={() => void persistWalkthrough(snapshot, onSnapshot, onApproval, onError)}>Save on the server</button>
      {session.role === "estimator" && snapshot.recordId && (
        <button className="btn secondary" type="button" onClick={async () => {
          const id = await persistWalkthrough(snapshot, onSnapshot, onApproval, onError);
          if (!id) return;
          await act(id, { type: "approve" }, onApproval, onError);
        }}>Approve and lock the numbers</button>
      )}
      {session.role === "customer" && snapshot.recordId && (
        <form className="grid" onSubmit={(event) => {
          event.preventDefault();
          const statement = String(new FormData(event.currentTarget).get("statement") ?? "");
          void act(snapshot.recordId!, { type: "authorize", statement }, onApproval, onError);
        }}>
          <label className="field">Authorization statement
            <textarea name="statement" required placeholder="I accept this version of the estimate." />
          </label>
          <button className="btn secondary" type="submit">Authorize this version</button>
        </form>
      )}
      {approval?.statement && <p className="meta">Customer statement: {approval.statement}</p>}
    </div>
  );
}

async function persistWalkthrough(
  snapshot: WalkthroughSnapshot,
  onSnapshot: (snapshot: WalkthroughSnapshot) => void,
  onApproval: (approval: Approval | null) => void,
  onError: (message: string | null) => void,
): Promise<string | null> {
  onError(null);
  const response = await fetch("/api/walkthroughs", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ id: snapshot.recordId, snapshot, videoKey: snapshot.videoKey ?? null }),
  });
  const body = await response.json();
  if (!response.ok) {
    onError(body.error ?? "The walkthrough was not saved.");
    return null;
  }
  const next = { ...snapshot, recordId: body.record.id };
  saveWalkthrough(next);
  onSnapshot(next);
  onApproval(body.record.approval);
  return body.record.id as string;
}

async function act(id: string, body: { type: string; statement?: string }, onApproval: (approval: Approval | null) => void, onError: (message: string | null) => void) {
  onError(null);
  const response = await fetch(`/api/walkthroughs/${id}/actions`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
  });
  const payload = await response.json();
  if (!response.ok) {
    onError(payload.error ?? "The version was not changed.");
    return;
  }
  onApproval(payload.record.approval);
}
