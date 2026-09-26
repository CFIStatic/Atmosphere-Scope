import type { DamageAssessment, DamageType, ObjectCondition, RoomObject, TranscriptSegment } from "@/domain/types";
import type { DetectionCluster } from "./dedupe";
import { sightingBox, sightingTileLabel } from "./dedupe";
import { cueMatches, narrationCues } from "./narration";

export type RoomMeasure = {
  roomName: string;
  wallSqft: number | null;
  ceilingSqft: number | null;
  floorSqft: number | null;
  baseboardLf: number | null;
  /** True only when the calibration check verified the ±5% target for this room. */
  calibrationMeetsTarget: boolean;
};

const COUNT_UNITS = new Set(["door", "window", "cabinet", "fixture", "outlet", "switch", "vent", "light", "hvac", "plumbing", "appliance", "contents", "furniture", "other"]);

export function assessClusters(clusters: DetectionCluster[], transcripts: TranscriptSegment[], rooms: { id: string; name: string }[], measures: RoomMeasure[] = []): RoomObject[] {
  const cues = narrationCues(transcripts);
  return clusters.map((cluster) => {
    const room = rooms.find((item) => item.name.toLowerCase() === cluster.roomName.toLowerCase());
    const related = cues.filter((cue) => cueMatches(cue, cluster.roomName, cluster.category, cluster.label));
    const quote = related.find((cue) => cue.damageTypes.length || cue.heightFt != null || cue.lengthFt != null || cue.unclear) ?? related[0] ?? null;
    const narratedDamage = [...new Set(related.flatMap((cue) => cue.damageTypes))];
    const visual = visualCondition(cluster);
    const confirmed = cluster.sightings.some((sighting) => sighting.confirmed);
    const unclearNarration = related.some((cue) => cue.unclear && cueMatches(cue, cluster.roomName, cluster.category, cluster.label) && (cue.categories.includes(cluster.category) || cue.quote.toLowerCase().includes(cluster.label.toLowerCase())));
    let condition: ObjectCondition = visual.condition;
    if (!confirmed) {
      if (unclearNarration && visual.condition !== "damaged") condition = "unclear";
      if (narratedDamage.length && condition !== "unclear") condition = "damaged";
      if (visual.condition === "damaged") condition = "damaged";
    }
    const damageTypes = [...new Set<DamageType>([...visual.damageTypes, ...narratedDamage])];
    if (condition !== "damaged") damageTypes.splice(0, damageTypes.length);
    const height = related.find((cue) => cue.heightFt != null)?.heightFt ?? null;
    const length = related.find((cue) => cue.lengthFt != null)?.lengthFt ?? null;
    const confidence = round3(Math.min(1, quote && narratedDamage.length ? Math.max(cluster.confidence, 0.8) : cluster.confidence));
    const measure = measures.find((item) => item.roomName.toLowerCase() === cluster.roomName.toLowerCase());
    const quantity = quantityFor(cluster, condition, height, length, measure);
    const extent = extentFor(condition, height, length, quantity, quote?.quote ?? null);
    const modelRationale = confirmed ? rankedRationale(cluster) : null;
    const rationale = modelRationale ?? oneSentence(cluster, condition, damageTypes, quote?.quote ?? null, extent);
    const assessment: DamageAssessment = {
      condition,
      damageTypes,
      severity: condition === "damaged" ? visual.severity ?? (narratedDamage.length ? "moderate" : "minor") : condition === "ok" ? "none" : null,
      extent,
      transcriptQuote: quote?.quote ?? null,
      transcriptStartMs: quote?.startMs ?? null,
      confidence,
      rationale,
    };
    const sightings = cluster.sightings.map((sighting, index) => ({
      mediaId: sighting.mediaId,
      frameId: sighting.frameId,
      timeMs: sighting.timeMs,
      box: cluster.boxes[index] ?? sightingBox(sighting),
      tile: sightingTileLabel(sighting),
    }));
    return {
      id: cluster.id,
      roomId: room?.id ?? null,
      roomName: cluster.roomName,
      category: cluster.category,
      label: cluster.label,
      material: cluster.material,
      condition,
      quantity,
      confidence,
      sightings,
      assessment,
      assessedBy: assessedByOf(cluster),
    };
  });
}

function assessedByOf(cluster: DetectionCluster): string | null {
  const ranked = [...cluster.sightings].sort((a, b) => (b.confidence ?? 0) - (a.confidence ?? 0));
  return ranked.find((sighting) => sighting.assessedBy)?.assessedBy ?? null;
}

function rankedRationale(cluster: DetectionCluster): string | null {
  const ranked = [...cluster.sightings].sort((a, b) => (b.confidence ?? 0) - (a.confidence ?? 0));
  const text = ranked.find((sighting) => sighting.rationale?.trim())?.rationale?.trim();
  return text || null;
}

function visualCondition(cluster: DetectionCluster): { condition: ObjectCondition; damageTypes: DamageType[]; severity: DamageAssessment["severity"] } {
  const ranked = [...cluster.sightings].sort((a, b) => (b.confidence ?? 0) - (a.confidence ?? 0));
  const top = ranked[0];
  const damageTypes = [...new Set(cluster.sightings.flatMap((sighting) => sighting.damageTypes))];
  const condition = top?.condition ?? (damageTypes.length ? "damaged" : "unclear");
  const severity = ranked.find((sighting) => sighting.severity && sighting.severity !== "none")?.severity ?? null;
  return { condition, damageTypes, severity };
}

function quantityFor(cluster: DetectionCluster, condition: ObjectCondition, height: number | null, length: number | null, measure: RoomMeasure | undefined): RoomObject["quantity"] {
  if (height != null && length != null && (cluster.category === "drywall" || cluster.category === "ceiling")) {
    return { value: round3(height * length), unit: "sqft", source: "narration", note: "Area is height times length from the narration. It is not a calibrated measurement." };
  }
  if (length != null && (cluster.category === "drywall" || cluster.category === "baseboard" || cluster.category === "trim" || cluster.category === "casing")) {
    return { value: length, unit: "lf", source: "narration", note: "Length is the narrator's statement. It is not a calibrated measurement." };
  }
  if (COUNT_UNITS.has(cluster.category)) {
    return { value: 1, unit: "each", source: "count", note: "Counted once after cross-frame dedupe. Not a tape measurement." };
  }
  if (condition === "damaged") {
    return { value: null, unit: surfaceUnit(cluster.category), source: "unmeasured", note: "No measured extent. Room area was not substituted." };
  }
  return geometryQuantity(cluster, measure);
}

function geometryQuantity(cluster: DetectionCluster, measure: RoomMeasure | undefined): RoomObject["quantity"] {
  if (!measure) return { value: null, unit: surfaceUnit(cluster.category), source: "unmeasured", note: "No room geometry for this surface." };
  const verified = measure.calibrationMeetsTarget;
  const note = verified
    ? "Calibration check verified this room measurement within ±5%."
    : "Room geometry. The calibration check did not verify it.";
  if (cluster.category === "baseboard" && measure.baseboardLf != null) return { value: measure.baseboardLf, unit: "lf", source: "geometry", note };
  if (cluster.category === "flooring" && measure.floorSqft != null) return { value: measure.floorSqft, unit: "sqft", source: "geometry", note };
  if (cluster.category === "ceiling" && measure.ceilingSqft != null) return { value: measure.ceilingSqft, unit: "sqft", source: "geometry", note };
  if ((cluster.category === "drywall" || cluster.category === "trim" || cluster.category === "casing") && measure.wallSqft != null) {
    return { value: measure.wallSqft, unit: cluster.category === "drywall" ? "sqft" : "lf", source: "geometry", note };
  }
  return { value: null, unit: surfaceUnit(cluster.category), source: "unmeasured", note: "No matching room measurement." };
}

function extentFor(condition: ObjectCondition, height: number | null, length: number | null, quantity: RoomObject["quantity"], quote: string | null): DamageAssessment["extent"] {
  if (condition !== "damaged") return { value: null, unit: null, note: "No damage extent.", heightFt: height, lengthFt: length };
  if (height != null && length != null) {
    return { value: round3(height * length), unit: "sqft", heightFt: height, lengthFt: length, note: `Narrator set ${height} ft by ${length} ft.${quote ? ` “${quote}”` : ""}` };
  }
  if (height != null) return { value: height, unit: "ft", heightFt: height, lengthFt: null, note: `Narrator set the wet height at ${height} ft. Length was not stated, so area was not calculated.${quote ? ` “${quote}”` : ""}` };
  if (length != null) return { value: length, unit: "lf", heightFt: null, lengthFt: length, note: `Narrator set the length at ${length} ft.${quote ? ` “${quote}”` : ""}` };
  if (quantity.source === "narration" && quantity.value != null) return { value: quantity.value, unit: quantity.unit === "each" ? null : quantity.unit, note: quantity.note };
  return { value: null, unit: null, note: "Damage is visible or reported, and the affected size was not measured." };
}

function oneSentence(cluster: DetectionCluster, condition: ObjectCondition, damageTypes: DamageType[], quote: string | null, extent: DamageAssessment["extent"]): string {
  if (condition === "unclear") {
    return `${cluster.label} in the ${cluster.roomName} is not clear enough to call damaged or sound.`;
  }
  if (condition === "ok") return `${cluster.label} in the ${cluster.roomName} shows no damage in the frames that include it.`;
  const kinds = damageTypes.length ? damageTypes.join(", ").replaceAll("_", " ") : "damage";
  const size = extent.value != null && extent.unit ? ` Extent is ${extent.value} ${extent.unit}.` : " Extent was not measured.";
  const said = quote ? " The narration is used as the extent." : "";
  return `${cluster.label} in the ${cluster.roomName} shows ${kinds}.${size}${said}`.replace(/\s+/g, " ").trim();
}

function surfaceUnit(category: DetectionCluster["category"]): "sqft" | "lf" | "each" {
  if (category === "baseboard" || category === "trim" || category === "casing") return "lf";
  if (COUNT_UNITS.has(category)) return "each";
  return "sqft";
}

function round3(value: number): number {
  return Math.round(value * 1000) / 1000;
}
