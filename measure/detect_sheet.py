"""Read one image on stdin and report whether the letter sheet is readable."""

from __future__ import annotations

import json
import sys

import cv2
import numpy as np

from measure.board_spec import make_board


def main() -> None:
    payload = sys.stdin.buffer.read()
    image = cv2.imdecode(np.frombuffer(payload, np.uint8), cv2.IMREAD_COLOR)
    if image is None:
        print(json.dumps({"readable": False, "corners": 0, "markers": 0, "note": "Could not read that frame."}))
        return
    board = make_board()
    corners, ids, _marker_corners, marker_ids = cv2.aruco.CharucoDetector(board).detectBoard(image)
    corner_count = 0 if corners is None else int(len(corners))
    marker_count = 0 if marker_ids is None else int(len(marker_ids))
    print(
        json.dumps(
            {
                "readable": corner_count >= 6,
                "corners": corner_count,
                "markers": marker_count,
                "note": "Sheet is large enough to use as scale." if corner_count >= 6 else "Move closer. The sheet has to fill more of the frame.",
            }
        )
    )


if __name__ == "__main__":
    main()
