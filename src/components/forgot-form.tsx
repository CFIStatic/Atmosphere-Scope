"use client";

import Link from "next/link";
import { useState } from "react";
import { RESET_SENT } from "@/auth/gate";

export function ForgotForm() {
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  return (
    <form className="grid" onSubmit={async (event) => {
      event.preventDefault();
      setError(null);
      setMessage(null);
      const email = String(new FormData(event.currentTarget).get("email") ?? "");
      const response = await fetch("/api/auth/forgot", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ email }),
      });
      const body = await response.json();
      if (!response.ok) {
        setError(body.error ?? RESET_SENT);
        return;
      }
      setMessage(body.message ?? RESET_SENT);
    }}>
      <label className="field">Email
        <input name="email" type="email" autoComplete="email" inputMode="email" autoCapitalize="none" spellCheck={false} required />
      </label>
      {error && <p className="error" role="alert">{error}</p>}
      {message && <p className="meta" role="status">{message}</p>}
      <button className="btn" type="submit">Send reset link</button>
      <p className="meta"><Link href="/login">Back to sign in</Link></p>
    </form>
  );
}
