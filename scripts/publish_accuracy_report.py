"""Write the accuracy harness report to the GitHub job summary.

The report is synthetic. This script does not turn it into a 95% claim.
"""

from __future__ import annotations

import json
import os
import sys
from pathlib import Path


def markdown(report: dict) -> str:
    lines = [
        "## Measurement accuracy",
        "",
        report.get("claim", "No claim was recorded."),
        "",
        "| Case | Method | Kind | Truth | Predicted | Actual % | Bar % | Meets | Safe |",
        "| --- | --- | --- | --- | --- | --- | --- | --- | --- |",
    ]
    for item in report.get("results", []):
        for row in item.get("rows", []):
            lines.append(
                "| {case} | {method} | {kind} | {truth} | {pred} | {actual} | {bar} | {meets} | {safe} |".format(
                    case=item.get("case"),
                    method=item.get("method"),
                    kind=row.get("kind"),
                    truth=row.get("truthFt"),
                    pred=row.get("valueFt"),
                    actual=row.get("actualPercent"),
                    bar=row.get("errorPercent"),
                    meets=row.get("meetsAccuracyTarget"),
                    safe=row.get("safe"),
                )
            )
    lines.append("")
    lines.append("Harness result: **SAFE**." if report.get("safe") else "Harness result: **UNSAFE**.")
    lines.append("")
    return "\n".join(lines)


def problems(report: dict) -> list[str]:
    found: list[str] = []
    if not report.get("safe"):
        found.append("The accuracy harness marked the run unsafe.")
    charuco = [item for item in report.get("results", []) if item.get("method") == "charuco_multiview"]
    if len(charuco) < 3:
        found.append("Expected a ChArUco result for each boarded room.")
    for item in charuco:
        walls = [row for row in item.get("rows", []) if row.get("kind") == "wall_length" and row.get("valueFt") is not None]
        if len(walls) < 2:
            found.append(f"{item.get('case')} did not measure both walls. The frames may be missing.")
    for item in report.get("results", []):
        if item.get("method") == "no_target" and any(row.get("valueFt") is not None for row in item.get("rows", [])):
            found.append("The no-target case produced a measurement.")
    return found


def main() -> int:
    path = Path(sys.argv[1] if len(sys.argv) > 1 else "eval/report.json")
    if not path.is_file():
        print("eval/report.json was not written.", file=sys.stderr)
        return 1
    report = json.loads(path.read_text())
    text = markdown(report)
    print(text)
    summary = os.environ.get("GITHUB_STEP_SUMMARY")
    if summary:
        with open(summary, "a", encoding="utf-8") as handle:
            handle.write(text)
            handle.write("\n")
    failed = problems(report)
    for item in failed:
        print(item, file=sys.stderr)
    return 1 if failed else 0


if __name__ == "__main__":
    sys.exit(main())
