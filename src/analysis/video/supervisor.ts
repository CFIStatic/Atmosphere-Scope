/**
 * In-process worker. instrumentation.ts starts it with the Node server.
 * Each tick claims one leased job. The loop continues until the queue is empty.
 * A second instance loses the compare-and-swap claim and waits.
 */

import { analysisJobStore } from "./job-queue";
import { tickAnalysisQueue } from "./worker";
import { getJob, readMediaFile, saveJob } from "@/storage/job-store";

let started = false;
let pumping = false;

export function analysisPollMs(env: Record<string, string | undefined> = process.env): number {
  const value = Number(env.ANALYSIS_POLL_MS);
  return Number.isFinite(value) && value >= 1000 ? value : 4000;
}

export function startAnalysisWorker(env: Record<string, string | undefined> = process.env): void {
  if (started) return;
  if (env.NEXT_RUNTIME && env.NEXT_RUNTIME !== "nodejs") return;
  started = true;
  const timer = setInterval(() => {
    void pump();
  }, analysisPollMs(env));
  timer.unref?.();
  void pump();
}

/** Run now, without waiting for the next poll. Safe to call after an upload. */
export function kickAnalysisWorker(): void {
  void pump();
}

async function pump(): Promise<void> {
  if (pumping) return;
  pumping = true;
  try {
    for (;;) {
      const result = await tickAnalysisQueue({
        store: analysisJobStore(),
        loadJob: getJob,
        saveJob,
        readMedia: async (key) => readMediaFile(key),
      });
      if (result.status === "idle") break;
    }
  } catch {
    /* The next poll retries. A failed claim must not stop the server. */
  } finally {
    pumping = false;
  }
}
