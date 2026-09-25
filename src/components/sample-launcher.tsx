"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";

export function SampleLauncher({ scenarioId }: { scenarioId: string }) {
  const router = useRouter();
  const [error, setError] = useState<string | null>(null);
  const [pending, setPending] = useState(false);
  return (
    <div>
      <button
        className="btn secondary"
        disabled={pending}
        onClick={async () => {
          setPending(true);
          setError(null);
          const response = await fetch("/api/samples", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ scenarioId }) });
          const body = await response.json();
          if (!response.ok) {
            setError(body.error ?? "Could not open the sample.");
            setPending(false);
            return;
          }
          router.push(`/jobs/${body.jobId}`);
        }}
      >
        {pending ? "Opening…" : "Open sample"}
      </button>
      {error && <p className="error">{error}</p>}
    </div>
  );
}
