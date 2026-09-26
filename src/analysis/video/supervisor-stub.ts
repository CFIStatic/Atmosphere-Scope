/** Edge bundle stand-in. The real worker runs only on the Node server. */

export function analysisPollMs(): number {
  return 4000;
}

export function startAnalysisWorker(): void {}

export function kickAnalysisWorker(): void {}
