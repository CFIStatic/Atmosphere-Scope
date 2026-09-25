"use client";

import { useState } from "react";

export function ShareJob({ jobId }: { jobId: string }) {
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  return (
    <form className="grid share-job" onSubmit={async (event) => {
      event.preventDefault();
      setError(null);
      setMessage(null);
      const email = String(new FormData(event.currentTarget).get("email") ?? "");
      const response = await fetch(`/api/jobs/${jobId}/share`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ email }),
      });
      const body = await response.json();
      if (!response.ok) {
        setError(body.error ?? "The job was not shared.");
        return;
      }
      setMessage(`Shared with ${body.share.email}. They only see this job and its estimates.`);
      event.currentTarget.reset();
    }}>
      <p className="kicker">Share with a customer</p>
      <label className="field">Customer email
        <input name="email" type="email" autoComplete="email" required />
      </label>
      {error && <p className="error" role="alert">{error}</p>}
      {message && <p className="meta" role="status">{message}</p>}
      <button className="btn secondary" type="submit">Share job</button>
    </form>
  );
}
