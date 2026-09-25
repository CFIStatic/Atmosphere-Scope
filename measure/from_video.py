"""Extract a short set of keyframes and measure them. Prints one JSON object."""

from __future__ import annotations

import json
import shutil
import subprocess
import sys
import tempfile
import time
from pathlib import Path

from measure.reconstruct import measure_directory


def run(video: Path, frames_dir: Path | None = None) -> dict:
    """Sample at 2 fps, keep at most 16 frames, and solve on the CPU.

    When frames_dir is set, the JPEGs are left there for the caller. Otherwise
    they are deleted before this returns. cpuMs is extract plus solve.
    """
    started = time.perf_counter()
    owned = frames_dir is None
    directory = frames_dir if frames_dir is not None else Path(tempfile.mkdtemp(prefix="scope-frames-"))
    directory.mkdir(parents=True, exist_ok=True)
    try:
        extract_started = time.perf_counter()
        extract = subprocess.run(
            [
                "ffmpeg",
                "-y",
                "-i",
                str(video),
                "-vf",
                "fps=2,scale=1080:-2",
                "-frames:v",
                "16",
                str(directory / "frame_%02d.jpg"),
            ],
            capture_output=True,
            text=True,
        )
        extract_ms = int((time.perf_counter() - extract_started) * 1000)
        if extract.returncode != 0:
            return {
                "error": "Could not read that video.",
                "detail": extract.stderr[-500:],
                "cpuMs": int((time.perf_counter() - started) * 1000),
                "extractMs": extract_ms,
                "solveMs": 0,
                "extractedFrames": 0,
            }
        solve_started = time.perf_counter()
        payload = measure_directory(directory)
        solve_ms = int((time.perf_counter() - solve_started) * 1000)
        payload["cpuMs"] = int((time.perf_counter() - started) * 1000)
        payload["extractMs"] = extract_ms
        payload["solveMs"] = solve_ms
        payload["extractedFrames"] = len(list(directory.glob("frame_*.jpg")))
        return payload
    finally:
        if owned:
            shutil.rmtree(directory, ignore_errors=True)


def main() -> None:
    if len(sys.argv) not in (2, 3):
        print(json.dumps({"error": "Usage: python -m measure.from_video VIDEO [FRAMES_DIR]"}))
        sys.exit(2)
    video = Path(sys.argv[1])
    frames_dir = Path(sys.argv[2]) if len(sys.argv) == 3 else None
    payload = run(video, frames_dir)
    print(json.dumps(payload))
    if payload.get("error"):
        sys.exit(1)


if __name__ == "__main__":
    main()
