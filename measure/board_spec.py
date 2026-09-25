"""Letter-size ChArUco board used as the metric scale anchor.

Print at 100% (no "fit to page"). The square size is the scale the solver trusts.
"""

from __future__ import annotations

import cv2
import numpy as np

# Both counts are odd. OpenCV's ChArUco corner interpolation breaks on even row counts
# after the 4.6 pattern change. 5 x 7 squares at 30 mm fit a US Letter sheet.
SQUARES_X = 5
SQUARES_Y = 7
SQUARE_M = 0.030
MARKER_M = 0.022
DICT_ID = cv2.aruco.DICT_4X4_50


def make_board() -> cv2.aruco.CharucoBoard:
    dictionary = cv2.aruco.getPredefinedDictionary(DICT_ID)
    return cv2.aruco.CharucoBoard((SQUARES_X, SQUARES_Y), SQUARE_M, MARKER_M, dictionary)


def board_size_m() -> tuple[float, float]:
    return (SQUARES_X * SQUARE_M, SQUARES_Y * SQUARE_M)


def render_board_image(ppi: int = 150) -> np.ndarray:
    """Raster of the printable board. 150 ppi keeps detection tests light."""
    width_m, height_m = board_size_m()
    margin_m = 0.012
    page_w = int(round((width_m + margin_m * 2) / 0.0254 * ppi))
    page_h = int(round((height_m + margin_m * 2) / 0.0254 * ppi))
    board = make_board()
    pattern = board.generateImage((page_w, page_h), marginSize=int(round(margin_m / 0.0254 * ppi)), borderBits=1)
    if pattern.ndim == 2:
        pattern = cv2.cvtColor(pattern, cv2.COLOR_GRAY2BGR)
    return pattern


def spec_dict() -> dict:
    return {
        "dictionary": "DICT_4X4_50",
        "squaresX": SQUARES_X,
        "squaresY": SQUARES_Y,
        "squareMeters": SQUARE_M,
        "markerMeters": MARKER_M,
        "print": "US Letter, 100% scale, no fit-to-page. Square size 30 mm.",
    }
