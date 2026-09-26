/**
 * Starts the walkthrough analysis worker on the Node server.
 * Edge and the production build do not poll.
 */

export async function register(): Promise<void> {
  if (process.env.NEXT_RUNTIME === "nodejs" && process.env.NEXT_PHASE !== "phase-production-build") {
    const { startAnalysisWorker } = await import("@/analysis/video/supervisor");
    startAnalysisWorker();
  }
}
