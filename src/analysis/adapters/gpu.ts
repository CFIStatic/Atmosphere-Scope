import { selectMeasurementBackend, type Env } from "@/analysis/config";

export type GpuAdapterReport = {
  requested: string;
  used: "local";
  invoked: false;
  note: string;
};

/** Optional speed adapters. This build never calls them and never substitutes a GPU measurement. */
export function gpuAdapterReport(env: Env = process.env): GpuAdapterReport {
  const selected = selectMeasurementBackend(env);
  return { requested: selected.requested, used: "local", invoked: false, note: selected.note };
}
