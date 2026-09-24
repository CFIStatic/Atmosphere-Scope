"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import Link from "next/link";

export default function NewJobPage() {
  const router = useRouter();
  const [error, setError] = useState<string | null>(null);
  const [pending, setPending] = useState(false);

  return (
    <main className="shell">
      <p className="brand"><span>Atmosphere</span>New job</p>
      <form
        className="panel grid"
        onSubmit={async (event) => {
          event.preventDefault();
          setPending(true);
          const form = new FormData(event.currentTarget);
          const response = await fetch("/api/jobs", { method: "POST", body: JSON.stringify(Object.fromEntries(form.entries())), headers: { "content-type": "application/json" } });
          const body = await response.json();
          if (!response.ok) {
            setError(body.error ?? "Could not create the job.");
            setPending(false);
            return;
          }
          router.push(`/jobs/${body.jobId}`);
        }}
      >
        <p className="kicker">Residential interior</p>
        <div className="form-grid">
          <label className="field">Address<input name="address" required placeholder="418 Maple Street" /></label>
          <label className="field">City<input name="city" required placeholder="Madison" /></label>
          <label className="field">Region<input name="region" required placeholder="WI" /></label>
          <label className="field">Postal code<input name="postalCode" required placeholder="53703" /></label>
          <label className="field">Customer<input name="customerName" required /></label>
          <label className="field">Phone<input name="phone" /></label>
          <label className="field">Email<input name="email" type="email" /></label>
        </div>
        <label className="field">Concern<textarea name="concern" required rows={4} placeholder="What the customer asked you to look at." /></label>
        {error && <p className="error">{error}</p>}
        <div className="row">
          <button className="btn" disabled={pending} type="submit">{pending ? "Creating…" : "Create job"}</button>
          <Link href="/">Cancel</Link>
        </div>
      </form>
    </main>
  );
}
