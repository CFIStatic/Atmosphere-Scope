import type { CatalogVersion } from "@/domain/catalog";
import type { FollowUpQuestion, RoomObject, ScopeItem, TranscriptSegment } from "@/domain/types";
import { assessClusters, type RoomMeasure } from "./assess";
import { dedupeDetections } from "./dedupe";
import type { RawDetection } from "./detect";
import { questionsFromObjects, scopeFromObjects } from "./line-items";

export type ObjectAnalysis = {
  objects: RoomObject[];
  scopeItems: ScopeItem[];
  questions: FollowUpQuestion[];
};

/** Inventory, dedupe, assess, and map. No network. No prices. */
export function analyzeObjects(input: {
  detections: RawDetection[];
  transcripts: TranscriptSegment[];
  rooms: { id: string; name: string }[];
  measures?: RoomMeasure[];
  catalog: CatalogVersion;
}): ObjectAnalysis {
  const objects = assessClusters(dedupeDetections(input.detections), input.transcripts, input.rooms, input.measures ?? []);
  return {
    objects,
    scopeItems: scopeFromObjects(objects, input.catalog),
    questions: questionsFromObjects(objects),
  };
}

export { questionsFromObjects, scopeFromObjects } from "./line-items";
export type { RawDetection } from "./detect";
export type { RoomMeasure } from "./assess";
