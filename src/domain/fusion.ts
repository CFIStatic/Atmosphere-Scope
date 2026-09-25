/**
 * Fuse metric sources for one dimension.
 *
 * Confirmed means a person or a laser locked the number, and nothing else
 * disagrees by more than 5%. Vision, including a ChArUco solve, is never
 * confirmed on its own. A source whose error bar is above 5%, or that has
 * not been evaluated (WebXR on this build), does not meet the target.
 */

export const ACCURACY_TARGET_PERCENT = 5;

export type ScaleSource =
  | "charuco"
  | "door_prior"
  | "known_object"
  | "user_reference"
  | "webxr"
  | "ble_laser"
  | "tape"
  | "none";

export type Reading = {
  source: ScaleSource;
  valueFt: number | null;
  /** Conservative bound, in percent of the value. Null means the source cannot bound its error. */
  errorPercent: number | null;
  /** True only for a tape the user locked, or a BLE laser spot check. */
  instrumentLock: boolean;
};

export type FusedDimension = {
  valueFt: number | null;
  errorPercent: number | null;
  meetsAccuracyTarget: boolean;
  confirmed: boolean;
  sources: ScaleSource[];
  ask: string | null;
  note: string;
};

const PRIOR_FLOOR: Partial<Record<ScaleSource, number>> = {
  door_prior: 8,
  known_object: 8,
  // No WebXR device was in the accuracy harness, so a hit-test cannot meet ±5% yet.
  webxr: 6,
};

const RANK: ScaleSource[] = ["tape", "ble_laser", "charuco", "user_reference", "webxr", "known_object", "door_prior", "none"];

function roundPercent(value: number): number {
  return Math.round(value * 100) / 100;
}

export function fuseDimension(readings: Reading[]): FusedDimension {
  const usable = readings.filter((reading) => reading.valueFt != null && reading.source !== "none");
  if (usable.length === 0) {
    return {
      valueFt: null,
      errorPercent: null,
      meetsAccuracyTarget: false,
      confirmed: false,
      sources: [],
      ask: "Retake with the calibration sheet in view, or lock this dimension with a tape or laser.",
      note: "No metric anchor.",
    };
  }

  const values = usable.map((reading) => reading.valueFt as number);
  const span = Math.max(...values) - Math.min(...values);
  const mid = (Math.max(...values) + Math.min(...values)) / 2;
  const disagreement = usable.length > 1 && mid > 0 ? (span / mid) * 100 : 0;
  const adopted = [...usable].sort((a, b) => RANK.indexOf(a.source) - RANK.indexOf(b.source))[0];
  let error = adopted.errorPercent;
  const floor = PRIOR_FLOOR[adopted.source];
  if (floor != null) error = Math.max(error ?? 0, floor);
  if (adopted.source === "user_reference" && !adopted.instrumentLock) {
    error = Math.max(error ?? 0, ACCURACY_TARGET_PERCENT + 0.1);
  }
  if (disagreement > ACCURACY_TARGET_PERCENT) error = Math.max(error ?? 0, disagreement);

  const sources = [...new Set(usable.map((reading) => reading.source))];
  const bounded = error != null && Number.isFinite(error);
  const meets =
    bounded &&
    (error as number) <= ACCURACY_TARGET_PERCENT &&
    disagreement <= ACCURACY_TARGET_PERCENT &&
    (adopted.source === "charuco" ||
      (adopted.instrumentLock && (adopted.source === "tape" || adopted.source === "ble_laser")));
  const confirmed = meets && adopted.instrumentLock && disagreement <= ACCURACY_TARGET_PERCENT;

  let note = "Estimated. Not a confirmed tape reading.";
  let ask: string | null = null;
  if (disagreement > ACCURACY_TARGET_PERCENT) {
    note = "Sources disagree by more than 5%. Nothing here is confirmed.";
    ask = "Retake the walkthrough or repeat the spot measurement. Do not average the disagreement into a confirmed number.";
  } else if (!meets) {
    note =
      adopted.source === "webxr"
        ? "WebXR depth is available on some Android phones, but this build has no accuracy result for it, so it does not meet ±5%."
        : adopted.source === "door_prior" || adopted.source === "known_object"
          ? "A known-size prior is wider than ±5%. It cannot meet the target on its own."
          : "The error bound is above 5%.";
    ask = "Retake with the calibration sheet in view, or lock this dimension with a tape or laser.";
  } else if (!confirmed) {
    note = "Within the reported error bound. Not confirmed until a tape or laser locks it.";
  } else {
    note = adopted.source === "ble_laser" ? "Locked from a laser spot check." : "Locked from a tape reading.";
  }

  return {
    valueFt: adopted.valueFt,
    errorPercent: error == null ? null : roundPercent(error),
    meetsAccuracyTarget: meets,
    confirmed,
    sources,
    ask,
    note,
  };
}
