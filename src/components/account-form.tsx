"use client";

import { useEffect, useState } from "react";

type PublicSession = { email: string; name: string; role: "estimator" | "customer" };

export function AccountForm() {
  const [mode, setMode] = useState<"local" | "supabase" | null>(null);
  const [session, setSession] = useState<PublicSession | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    void fetch("/api/auth/session").then(async (response) => {
      const body = await response.json();
      setMode(body.mode);
      setSession(body.session);
    });
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
