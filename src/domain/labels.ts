import type { EstimateStatus } from "./types";

export function dimensionLabel(label: string): string {
  const key = label.trim().toLowerCase();
  if (key === "span_a" || key === "width" || key === "wall_length") return "Width";
  if (key === "span_b" || key === "depth") return "Depth";
  if (key === "height" || key === "ceiling_height") return "Height";
  if (key === "area" || key === "floor_area") return "Floor area";
  return label.replaceAll("_", " ");
}

export function priceChip(status: string): "Verified" | "Needs price" | "Not verified" {
  if (status === "verified") return "Verified";
  if (status === "unpriced") return "Needs price";
  return "Not verified";
}

export function jobStatusChip(status: EstimateStatus | null | undefined): string {
  if (!status || status === "ai_draft") return "Draft";
  if (status === "estimator_reviewed") return "Needs approval";
  if (status === "estimator_approved") return "Needs authorization";
  if (status === "customer_authorized") return "Authorized";
  return "Superseded";
}
