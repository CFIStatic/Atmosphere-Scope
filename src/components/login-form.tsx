"use client";

import Link from "next/link";
import { useState } from "react";
import { PasswordField } from "@/components/password-field";
import { CONFIRM_SENT, MIN_PASSWORD_LENGTH, passwordProblem, safeNext } from "@/auth/gate";

export function LoginForm({ devFallback, nextPath, notice }: { devFallback: boolean; nextPath: string; notice: string | null }) {
  const [error, setError] = useState<string | null>(notice);
  const [confirmNote, setConfirmNote] = useState<string | null>(null);
  const [pending, setPending] = useState(false);

  return (
    <div className="grid">
      <form className="grid" onSubmit={async (event) => {
        event.preventDefault();
        setError(null);
        const form = new FormData(event.currentTarget);
        const password = String(form.get("password") ?? "");
        const problem = passwordProblem(password);
        if (problem) {
          setError(problem);
          return;
        }
        setPending(true);
        const response = await fetch("/api/auth/session", {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({ email: form.get("email"), password }),
        });
        const body = await response.json();
        setPending(false);
        if (!response.ok) {
          setError(body.error ?? "Email or password is incorrect.");
          return;
        }
        window.location.assign(safeNext(nextPath));
      }}>
        <label className="field">Email
          <input name="email" type="email" autoComplete="email" inputMode="email" autoCapitalize="none" spellCheck={false} required />
        </label>
        <PasswordField name="password" label="Password" autoComplete="current-password" minLength={MIN_PASSWORD_LENGTH} />
        {error && <p className="error" role="alert">{error}</p>}
        <button className="btn" type="submit" disabled={pending}>Sign in</button>
      </form>
      <p className="meta"><Link href="/forgot">Forgot password</Link></p>
      <details className="quiet">
      <summary>Resend confirmation</summary>
      <form className="grid" onSubmit={async (event) => {
        event.preventDefault();
        setConfirmNote(null);
        const email = String(new FormData(event.currentTarget).get("email") ?? "");
        const response = await fetch("/api/auth/resend", {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({ email }),
        });
        const body = await response.json();
        setConfirmNote(body.error ?? body.message ?? CONFIRM_SENT);
      }}>
        <label className="field">Email
          <input name="email" type="email" autoComplete="email" inputMode="email" autoCapitalize="none" spellCheck={false} required />
        </label>
        <button className="btn secondary" type="submit">Resend confirmation</button>
        {confirmNote && <p className="meta" role="status">{confirmNote}</p>}
      </form>
      </details>
      {devFallback && (
        <details className="dev-signin">
          <summary>Dev-only sign-in, no password</summary>
          <form className="grid" onSubmit={async (event) => {
            event.preventDefault();
            setError(null);
            const form = new FormData(event.currentTarget);
            const response = await fetch("/api/auth/dev", {
              method: "POST",
              headers: { "content-type": "application/json" },
              body: JSON.stringify({ name: form.get("name"), email: form.get("email"), role: form.get("role") }),
            });
            const body = await response.json();
            if (!response.ok) {
              setError(body.error ?? "Dev sign-in failed.");
              return;
            }
            window.location.assign(safeNext(nextPath));
          }}>
            <p className="meta">This panel is only for a server that is not using Supabase. It does not create a password account, and it cannot pick admin.</p>
            <label className="field">Name <input name="name" autoComplete="name" required /></label>
            <label className="field">Email <input name="email" type="email" autoComplete="email" required /></label>
            <label className="field">Role
              <select name="role" defaultValue="estimator">
                <option value="estimator">Estimator</option>
                <option value="customer">Customer</option>
              </select>
            </label>
            <button className="btn secondary" type="submit">Use dev sign-in</button>
          </form>
        </details>
      )}
    </div>
  );
}
