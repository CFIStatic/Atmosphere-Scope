import type { BoundingBox, ObjectCategory } from "@/domain/types";
import { centerDistance, normLabel, normRoom, stableObjectId, tileToFrame, type RawDetection } from "./detect";
import { tileLabel } from "./tiles";

/**
 * One physical thing, possibly seen in several frames and crops.
 * Large built-ins merge across angles. Small repeated devices (outlets, switches)
 * stay separate when the same frame shows them apart.
 */
export type DetectionCluster = {
  id: string;
  roomName: string;
  category: ObjectCategory;
  label: string;
  material: string | null;
  confidence: number;
  sightings: RawDetection[];
  boxes: BoundingBox[];
};

const SURFACES = new Set<ObjectCategory>(["drywall", "ceiling", "baseboard", "trim", "casing", "flooring", "countertop"]);
const ANGLE_MERGE = new Set<ObjectCategory>(["cabinet", "door", "window", "appliance", "furniture", "hvac", "plumbing", "contents"]);

const SAME_FRAME_SPLIT = 0.03;

export function dedupeDetections(items: RawDetection[]): DetectionCluster[] {
  const clusters: DetectionCluster[] = [];
  const ordered = [...items].sort((a, b) => a.timeMs - b.timeMs || a.frameId.localeCompare(b.frameId));
  for (const item of ordered) {
    const box = tileToFrame(item.box, item.tile);
    const roomName = normRoom(item.roomHint);
    const label = displayLabel(item);
    const key = clusterKey(item, roomName, label);
    const candidates = clusters.filter((cluster) => clusterKeyFrom(cluster) === key);
    const sameFrame = candidates.filter((cluster) => cluster.sightings.some((sighting) => sighting.frameId === item.frameId && sighting.mediaId === item.mediaId));
    const farInFrame = sameFrame.find((cluster) => cluster.boxes.some((existing) => centerDistance(existing, box) > SAME_FRAME_SPLIT));
    let target: DetectionCluster | undefined;
    if (sameFrame.length && !farInFrame) {
      target = nearest(sameFrame, box);
    } else if (!sameFrame.length) {
      if (SURFACES.has(item.category) || ANGLE_MERGE.has(item.category)) target = candidates[0];
      else target = nearestWithin(candidates, box, 0.05);
    } else if (farInFrame && sameFrame.length === candidates.length) {
      target = undefined;
    } else {
      target = nearestWithin(candidates.filter((cluster) => !sameFrame.includes(cluster)), box, 0.05);
    }
    if (!target) {
      const index = candidates.length;
      target = {
        id: stableObjectId([roomName, item.category, item.material ?? "", normLabel(label), String(index)]),
        roomName,
        category: item.category,
        label,
        material: item.material?.trim() || null,
        confidence: clampConfidence(item.confidence),
        sightings: [],
        boxes: [],
      };
      clusters.push(target);
    }
    target.sightings.push(item);
    target.boxes.push(box);
    target.confidence = Math.max(target.confidence, clampConfidence(item.confidence));
    if (!target.material && item.material?.trim()) target.material = item.material.trim();
  }
  return clusters;
}

export function sightingBox(item: RawDetection): BoundingBox {
  return tileToFrame(item.box, item.tile);
}

export function sightingTileLabel(item: RawDetection): string | null {
  return tileLabel(item.tile);
}

function clusterKey(item: RawDetection, roomName: string, label: string): string {
  if (SURFACES.has(item.category)) return `${roomName}|${item.category}|${(item.material ?? "").trim().toLowerCase()}`;
  return `${roomName}|${item.category}|${normLabel(label)}`;
}

function clusterKeyFrom(cluster: DetectionCluster): string {
  if (SURFACES.has(cluster.category)) return `${cluster.roomName}|${cluster.category}|${(cluster.material ?? "").trim().toLowerCase()}`;
  return `${cluster.roomName}|${cluster.category}|${normLabel(cluster.label)}`;
}

function nearest(clusters: DetectionCluster[], box: BoundingBox): DetectionCluster | undefined {
  return [...clusters].sort((a, b) => minDistance(a, box) - minDistance(b, box))[0];
}

function nearestWithin(clusters: DetectionCluster[], box: BoundingBox, max: number): DetectionCluster | undefined {
  const hit = nearest(clusters, box);
  if (!hit || minDistance(hit, box) > max) return undefined;
  return hit;
}

function minDistance(cluster: DetectionCluster, box: BoundingBox): number {
  if (!cluster.boxes.length) return Infinity;
  return Math.min(...cluster.boxes.map((existing) => centerDistance(existing, box)));
}

function displayLabel(item: RawDetection): string {
  const raw = item.label.trim();
  if (raw) return raw.replace(/\b\w/g, (letter) => letter.toUpperCase());
  return item.category.replace(/\b\w/g, (letter) => letter.toUpperCase());
}

function clampConfidence(value: number): number {
  if (!Number.isFinite(value)) return 0;
  return Math.min(1, Math.max(0, value));
}
