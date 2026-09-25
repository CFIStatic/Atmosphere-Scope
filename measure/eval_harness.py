"""Score the measurement pipeline against tape-equivalent truth.

A run fails closed when the system marks a dimension as meeting the ±5% target
and the actual error is above 5%, or above the error bar it reported.
The harness does not declare the product 95% accurate. It prints the errors it
actually measured.
"""

from __future__ import annotations

import json
import sys
from pathlib import Path

from measure.reconstruct import measure_directory

TARGET = 5.0
ROOT = Path(__file__).resolve().parents[1]
CASES = ROOT / "eval" / "cases"


def _actual(predicted: float | None, truth: float) -> float | None:
    if predicted is None:
        return None
    return abs(predicted - truth) / truth * 100.0


def _pair(truth_dims: list[dict], predicted: list[dict], kind: str) -> list[dict]:
    truths = sorted((item for item in truth_dims if item["kind"] == kind), key=lambda item: item["valueFt"])
    preds = sorted((item for item in predicted if item["kind"] == kind), key=lambda item: item["valueFt"] if item["valueFt"] is not None else 1e9)
    rows = []
    for index, truth in enumerate(truths):
        pred = preds[index] if index < len(preds) else None
        actual = _actual(None if pred is None else pred.get("valueFt"), truth["valueFt"])
        claimed = bool(pred and pred.get("meetsAccuracyTarget"))
        bar = None if pred is None else pred.get("errorPercent")
        covered = actual is None or bar is None or actual <= bar + 0.05
        safe = (not claimed) or (actual is not None and actual <= TARGET and covered)
        rows.append(
            {
                "truthId": truth["id"],
                "kind": kind,
                "truthFt": truth["valueFt"],
                "valueFt": None if pred is None else pred.get("valueFt"),
                "actualPercent": None if actual is None else round(actual, 2),
                "errorPercent": bar,
                "meetsAccuracyTarget": claimed,
                "confirmed": bool(pred and pred.get("confirmed")),
                "sources": [] if pred is None else pred.get("sources", []),
                "barCoversTruth": covered if actual is not None else False,
                "safe": safe,
            }
        )
    return rows


def score_case(case_dir: Path, scale: str) -> dict:
    truth = json.loads((case_dir / "truth.json").read_text())
    frames = case_dir / "frames"
    if scale == "none" or not truth.get("withBoard", True):
        measured = measure_directory(frames, scale="none")
        method = "no_target"
    else:
        measured = measure_directory(frames, scale=scale)
        method = measured["method"]
    rows = []
    rows.extend(_pair(truth["dimensions"], measured["dimensions"], "wall_length"))
    rows.extend(_pair(truth["dimensions"], measured["dimensions"], "ceiling_height"))
    rows.extend(_pair(truth["dimensions"], measured["dimensions"], "floor_area"))
    return {
        "case": truth["id"],
        "kind": truth.get("kind"),
        "method": method,
        "notes": measured.get("notes", []),
        "calibrationRmsPx": measured.get("calibrationRmsPx"),
        "rows": rows,
        "safe": all(row["safe"] for row in rows),
    }


def main() -> int:
    results = []
    for case_dir in sorted(path for path in CASES.iterdir() if (path / "truth.json").exists()):
        truth = json.loads((case_dir / "truth.json").read_text())
        if truth.get("withBoard", True):
            results.append(score_case(case_dir, "charuco"))
            results.append(score_case(case_dir, "door"))
        else:
            results.append(score_case(case_dir, "none"))
    report = {
        "targetPercent": TARGET,
        "claim": "The harness does not support a 95% accuracy claim for real rooms. These figures are synthetic pinhole renders plus ablations. No tape-measured real video was scored.",
        "methodsNotRun": [
            "COLMAP and learned multi-view models (DUSt3R, MASt3R, VGGT) were not run. This machine has no GPU and those models are multi-gigabyte. Metric scale here comes from the ChArUco sheet, not from an unscaled point cloud.",
            "WebXR depth was not run. No supporting Android device is attached. The browser path degrades to 'unsupported' and does not invent a measurement.",
            "Web Bluetooth laser meters were not run. No Bosch or Leica meter is attached. A lock from that path is not claimed.",
            "Monocular relative depth is not a metric method and is not scored.",
        ],
        "results": results,
        "safe": all(item["safe"] for item in results),
    }
    out = ROOT / "eval" / "report.json"
    out.write_text(json.dumps(report, indent=2))
    print(f"{'case':28} {'method':20} {'kind':16} {'truth':7} {'pred':7} {'actual':7} {'bar':7} {'meet':5} {'safe'}")
    for item in results:
        for row in item["rows"]:
            print(
                f"{item['case'][:28]:28} {item['method'][:20]:20} {row['kind']:16} "
                f"{row['truthFt']!s:7} {row['valueFt']!s:7} {row['actualPercent']!s:7} {row['errorPercent']!s:7} "
                f"{str(row['meetsAccuracyTarget']):5} {row['safe']}"
            )
    print("SAFE" if report["safe"] else "UNSAFE")
    return 0 if report["safe"] else 1


if __name__ == "__main__":
    sys.exit(main())
