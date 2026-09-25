"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { PasswordField } from "@/components/password-field";
import { loadWalkthrough, saveWalkthrough, type WalkthroughSnapshot } from "@/capture/snapshot";
import { MIN_PASSWORD_LENGTH, passwordProblem } from "@/auth/gate";

type PublicSession = { email: string; name: string; role: "admin" | "estimator" | "customer" };
type Approval = { status: string; approvedBy: string | null; authorizedBy: string | null; statement: string | null };

export function AccountForm({ notice }: { notice: string | null }) {
  const [mode, setMode] = useState<"local" | "supabase" | null>(null);
  const [session, setSession] = useState<PublicSession | null>(null);
  const [error, setError] = useState<string | null>(notice);
  const [saved, setSaved] = useState<string | null>(null);
  const [snapshot, setSnapshot] = useState<WalkthroughSnapshot | null>(null);
  const [approval, setApproval] = useState<Approval | null>(null);

  useEffect(() => {
    void fetch("/api/auth/session").then(async (response) => {
      const body = await response.json();
      setMode(body.mode);
      setSession(body.session);
    });
    const savedWalkthrough = loadWalkthrough();
    setSnapshot(savedWalkthrough);
    if (savedWalkthrough?.recordId) {
      void fetch(`/api/walkthroughs/${savedWalkthrough.recordId}`).then(async (response) => {
        if (!response.ok) return;
        const body = await response.json();
        setApproval(body.record?.approval ?? null);
      });
    }
  }, []);

  return (
    <section className="panel grid">
      {session ? (
        <p>{session.name} · {session.email} · {session.role}</p>
      ) : (
        <p className="meta">You are not signed in. <Link href="/login">Sign in</Link>.</p>
      )}
      {session?.role === "admin" && <p className="meta"><Link href="/admin/users">Users</Link> · <Link href="/admin/system">System</Link></p>}
      {session && <p className="meta">Approval and authorization stay separate.</p>}
      <form className="grid" onSubmit={async (event) => {
        event.preventDefault();
        setError(null);
        setSaved(null);
        const form = new FormData(event.currentTarget);
        const password = String(form.get("password") ?? "");
        const problem = passwordProblem(password);
        if (problem) {
          setError(problem);
          return;
        }
        const response = await fetch("/api/auth/password", {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({ currentPassword: form.get("currentPassword"), password }),
        });
        const body = await response.json();
        if (!response.ok) {
          setError(body.error ?? "The password was not changed.");
          return;
        }
        setSaved("Password updated.");
        event.currentTarget.reset();
      }}>
        <p className="kicker">Change password</p>
        <PasswordField name="currentPassword" label="Current password" autoComplete="current-password" />
        <PasswordField name="password" label="New password" autoComplete="new-password" minLength={MIN_PASSWORD_LENGTH} />
        {error && <p className="error" role="alert">{error}</p>}
        {saved && <p className="meta" role="status">{saved}</p>}
        {mode === "local" && <p className="meta">Password changes go through Supabase. This server is in local mode.</p>}
        <button className="btn" type="submit">Update password</button>
      </form>
      {session && (
        <button className="btn secondary" type="button" onClick={async () => {
          await fetch("/api/auth/session", { method: "DELETE" });
          setSession(null);
          window.location.assign("/login");
        }}>Sign out</button>
      )}
      {session && (
        <WalkthroughActions session={session} snapshot={snapshot} approval={approval} onSnapshot={setSnapshot} onApproval={setApproval} onError={setError} />
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
