"use client";

import Link from "next/link";
import { useState } from "react";
import { PasswordField } from "@/components/password-field";
import { LINK_INVALID, MIN_PASSWORD_LENGTH, passwordProblem } from "@/auth/gate";

export function ResetForm({ invalid }: { invalid: boolean }) {
  const [error, setError] = useState<string | null>(invalid ? LINK_INVALID : null);
  const [done, setDone] = useState(false);

  return (
    <form className="grid" onSubmit={async (event) => {
      event.preventDefault();
      setError(invalid ? LINK_INVALID : null);
      const password = String(new FormData(event.currentTarget).get("password") ?? "");
      const again = String(new FormData(event.currentTarget).get("confirm") ?? "");
      const problem = passwordProblem(password);
      if (problem) {
        setError(problem);
        return;
      }
      if (password !== again) {
        setError("Those passwords do not match.");
        return;
      }
      const response = await fetch("/api/auth/password", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ password }),
      });
      const body = await response.json();
      if (!response.ok) {
        setError(response.status === 401 ? LINK_INVALID : (body.error ?? LINK_INVALID));
        return;
      }
      setDone(true);
    }}>
      {invalid && (
        <p className="error" role="alert">{LINK_INVALID} <Link href="/forgot">Request another</Link>.</p>
      )}
      <PasswordField name="password" label="New password" autoComplete="new-password" minLength={MIN_PASSWORD_LENGTH} />
      <PasswordField name="confirm" label="Confirm new password" autoComplete="new-password" minLength={MIN_PASSWORD_LENGTH} />
      {error && !invalid && <p className="error" role="alert">{error}</p>}
      {done && <p className="meta" role="status">Password updated. <Link href="/login">Sign in</Link>.</p>}
      <button className="btn" type="submit">Set password</button>
      {!invalid && <p className="meta"><Link href="/forgot">Request another link</Link></p>}
    </form>
  );
}
