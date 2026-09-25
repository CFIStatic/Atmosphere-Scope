"""Extract a short set of keyframes and measure them. Prints one JSON object."""

from __future__ import annotations

import json
import subprocess
import sys
import tempfile
from pathlib import Path

from measure.reconstruct import measure_directory


def main() -> None:
    if len(sys.argv) != 2:
        print(json.dumps({"error": "Usage: python -m measure.from_video VIDEO"}))
        sys.exit(2)
    video = Path(sys.argv[1])
    with tempfile.TemporaryDirectory(prefix="scope-frames-") as directory:
        out = Path(directory)
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
                str(out / "frame_%02d.jpg"),
            ],
            capture_output=True,
            text=True,
        )
        if extract.returncode != 0:
            print(json.dumps({"error": "Could not read that video.", "detail": extract.stderr[-500:]}))
            sys.exit(1)
        print(json.dumps(measure_directory(out)))


if __name__ == "__main__":
    main()
