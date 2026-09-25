"""Render a rectangular room and a letter-size ChArUco board with known dimensions.

The camera model is a pinhole plus radial distortion. Ground truth is the room,
not the poses. The measurement pipeline is not given the poses or the truth.
"""

from __future__ import annotations

import json
from pathlib import Path

import cv2
import numpy as np

from measure.board_spec import make_board, render_board_image

METERS_PER_FOOT = 0.3048


def look_at(eye: np.ndarray, target: np.ndarray) -> tuple[np.ndarray, np.ndarray]:
    forward = target - eye
    forward = forward / np.linalg.norm(forward)
    up = np.array([0.0, 0.0, 1.0])
    right = np.cross(forward, up)
    if np.linalg.norm(right) < 1e-6:
        up = np.array([0.0, 1.0, 0.0])
        right = np.cross(forward, up)
    right = right / np.linalg.norm(right)
    down = np.cross(forward, right)
    rotation = np.stack([right, down, forward], axis=0)
    translation = -rotation @ eye
    return rotation, translation


def project(points: np.ndarray, rotation: np.ndarray, translation: np.ndarray, k: np.ndarray, dist: np.ndarray) -> tuple[np.ndarray, np.ndarray]:
    pts = points.reshape(-1, 1, 3).astype(np.float64)
    img, _ = cv2.projectPoints(pts, cv2.Rodrigues(rotation)[0], translation.reshape(3, 1), k, dist)
    cam = (rotation @ points.T).T + translation
    return img.reshape(-1, 2), cam[:, 2]


def draw_poly(image: np.ndarray, pixels: np.ndarray, depth: np.ndarray, color: tuple[int, int, int]) -> None:
    if np.any(depth <= 0.05):
        return
    if pixels.shape[0] < 3:
        return
    if not np.isfinite(pixels).all():
        return
    contour = np.round(pixels).astype(np.int32)
    cv2.fillConvexPoly(image, contour, color)


def _signed_area(pixels: np.ndarray) -> float:
    x, y = pixels[:, 0], pixels[:, 1]
    return 0.5 * float(np.sum(x * np.roll(y, -1) - np.roll(x, -1) * y))


def board_page_world(origin: np.ndarray, yaw: float) -> np.ndarray:
    """World corners of the printed page, including the 12 mm margin.

    Object +Y is mapped to world -Y. That keeps the printed codes right-reading
    for a camera above the floor (homography determinant stays positive). The
    board's own +Z then points down; the solver flips it when it reports height.
    """
    board = make_board()
    squares_x, squares_y = board.getChessboardSize()
    square = float(board.getSquareLength())
    margin = 0.012
    bw, bh = float(squares_x) * square, float(squares_y) * square
    obj = np.array(
        [[-margin, -margin], [bw + margin, -margin], [bw + margin, bh + margin], [-margin, bh + margin]],
        np.float64,
    )
    cos, sin = np.cos(yaw), np.sin(yaw)
    rotated = obj @ np.array([[cos, sin], [-sin, cos]])
    world = np.zeros((4, 3), np.float64)
    world[:, 0] = origin[0] + rotated[:, 0]
    world[:, 1] = origin[1] - rotated[:, 1]
    return world


def paint_page(image: np.ndarray, page_bgr: np.ndarray, pixels: np.ndarray) -> None:
    if np.any(~np.isfinite(pixels)):
        return
    src = np.array(
        [[0, 0], [page_bgr.shape[1] - 1, 0], [page_bgr.shape[1] - 1, page_bgr.shape[0] - 1], [0, page_bgr.shape[0] - 1]],
        np.float32,
    )
    matrix = cv2.getPerspectiveTransform(src, pixels.astype(np.float32))
    if np.linalg.det(matrix) <= 0:
        # A mirrored warp decodes the wrong codes. Skip rather than teach the solver a reflection.
        return
    warped = cv2.warpPerspective(page_bgr, matrix, (image.shape[1], image.shape[0]), flags=cv2.INTER_LINEAR)
    mask = np.zeros(image.shape[:2], np.uint8)
    contour = np.round(pixels).astype(np.int32)
    if contour.shape[0] >= 3 and np.isfinite(contour).all():
        cv2.fillConvexPoly(mask, contour, 255)
        image[mask > 0] = warped[mask > 0]


def render_frame(
    width_m: float,
    depth_m: float,
    height_m: float,
    eye: np.ndarray,
    target: np.ndarray,
    k: np.ndarray,
    dist: np.ndarray,
    image_size: tuple[int, int],
    board_bgr: np.ndarray | None,
    board_origin: np.ndarray,
    yaw: float = 0.0,
) -> np.ndarray:
    width_px, height_px = image_size
    image = np.full((height_px, width_px, 3), 244, np.uint8)
    rotation, translation = look_at(eye, target)

    def paint(quad: np.ndarray, color: tuple[int, int, int]) -> None:
        pixels, depth = project(quad, rotation, translation, k, dist)
        if not np.isfinite(pixels).all():
            return
        draw_poly(image, pixels, depth, color)

    w, d, h = width_m, depth_m, height_m
    paint(np.array([[0, 0, 0], [w, 0, 0], [w, d, 0], [0, d, 0]], np.float64), (214, 206, 196))
    paint(np.array([[0, 0, 0], [w, 0, 0], [w, 0, h], [0, 0, h]], np.float64), (186, 178, 168))
    paint(np.array([[w, 0, 0], [w, d, 0], [w, d, h], [w, 0, h]], np.float64), (176, 168, 158))
    paint(np.array([[w, d, 0], [0, d, 0], [0, d, h], [w, d, h]], np.float64), (168, 160, 150))
    paint(np.array([[0, d, 0], [0, 0, 0], [0, 0, h], [0, d, h]], np.float64), (160, 152, 142))
    paint(np.array([[0, 0, h], [w, 0, h], [w, d, h], [0, d, h]], np.float64), (232, 228, 222))
    door_h = 80 * 0.0254
    door_w = 30 * 0.0254
    door_x = min(w - door_w - 0.05, w * 0.72)
    paint(
        np.array(
            [[door_x, 0.015, 0], [door_x + door_w, 0.015, 0], [door_x + door_w, 0.015, door_h], [door_x, 0.015, door_h]],
            np.float64,
        ),
        (92, 72, 58),
    )
    if board_bgr is not None:
        page = board_page_world(board_origin, yaw)
        pixels, depth = project(page, rotation, translation, k, dist)
        if np.all(depth > 0.05) and np.isfinite(pixels).all():
            paint_page(image, board_bgr, pixels)
    return image


def apply_distortion(image: np.ndarray, k: np.ndarray, dist: np.ndarray) -> np.ndarray:
    """Turn a pinhole rendering into a radially distorted frame.

    A homography of the sheet's four corners cannot bend the markers the way a
    lens does. Distortion is applied to the finished frame so interior corners
    land where cv2.projectPoints says they should.
    """
    height, width = image.shape[:2]
    xs, ys = np.meshgrid(np.arange(width, dtype=np.float64), np.arange(height, dtype=np.float64))
    pixels = np.stack([xs.ravel(), ys.ravel()], axis=1)
    normalized = cv2.undistortPoints(pixels.reshape(-1, 1, 2), k, dist).reshape(-1, 2)
    map_x = (k[0, 0] * normalized[:, 0] + k[0, 2]).reshape(height, width).astype(np.float32)
    map_y = (k[1, 1] * normalized[:, 1] + k[1, 2]).reshape(height, width).astype(np.float32)
    return cv2.remap(image, map_x, map_y, cv2.INTER_LINEAR, borderMode=cv2.BORDER_CONSTANT, borderValue=(244, 244, 244))


def intrinsics(image_size: tuple[int, int], fov_deg: float, k1: float) -> tuple[np.ndarray, np.ndarray]:
    width_px, height_px = image_size
    fx = (width_px / 2) / np.tan(np.deg2rad(fov_deg) / 2)
    k = np.array([[fx, 0, width_px / 2], [0, fx, height_px / 2], [0, 0, 1]], np.float64)
    dist = np.array([k1, 0.02, 0, 0, 0], np.float64)
    return k, dist


def walk_poses(width_m: float, depth_m: float, board_origin: np.ndarray, yaw: float) -> list[tuple[np.ndarray, np.ndarray]]:
    """Close orbit. The letter sheet only resolves inside about 0.7 m.

    Each view keeps the sheet large in the lower frame and aims past it so one
    far wall, the floor line, and as much of the ceiling line as the lens allows
    stay in view. The sheet is the scale; the walls are the measurement.
    """
    page = board_page_world(board_origin, yaw)
    center = page.mean(axis=0)
    poses = []
    # Phone-like portrait sweep. The sheet stays large at the bottom of the frame
    # while the far wall's floor line, and on the higher tilt the ceiling, enter the view.
    for look_z in (0.02, 0.28):
        for index in range(8):
            angle = 2 * np.pi * index / 8 + 0.15
            direction = np.array([np.cos(angle), np.sin(angle)])
            eye_xy = center[:2] - 0.30 * direction
            eye_xy[0] = float(np.clip(eye_xy[0], 0.25, width_m - 0.25))
            eye_xy[1] = float(np.clip(eye_xy[1], 0.25, depth_m - 0.25))
            eye = np.array([eye_xy[0], eye_xy[1], 0.50])
            look = np.array([center[0] + 0.50 * direction[0], center[1] + 0.50 * direction[1], look_z])
            poses.append((eye, look))
    return poses


def build_case(
    out_dir: Path,
    seed: int = 7,
    width_ft: float = 12.0,
    depth_ft: float = 14.0,
    height_ft: float = 8.0,
    case_id: str = "synthetic-rect-charuco",
    with_board: bool = True,
    yaw: float = 0.12,
    fov_deg: float = 74.0,
    k1: float = -0.12,
) -> dict:
    out_dir.mkdir(parents=True, exist_ok=True)
    rng = np.random.default_rng(seed)
    width_m, depth_m, height_m = (width_ft * METERS_PER_FOOT, depth_ft * METERS_PER_FOOT, height_ft * METERS_PER_FOOT)
    image_size = (1080, 1920)
    k, dist = intrinsics(image_size, fov_deg=fov_deg, k1=k1)
    board_img = render_board_image(ppi=130) if with_board else None
    board_origin = np.array([width_m * 0.40, depth_m * 0.45, 0.0])
    frames_dir = out_dir / "frames"
    frames_dir.mkdir(exist_ok=True)
    video_path = out_dir / "walkthrough.mp4"
    writer = cv2.VideoWriter(str(video_path), cv2.VideoWriter_fourcc(*"mp4v"), 4, image_size)
    for index, (eye, look) in enumerate(walk_poses(width_m, depth_m, board_origin, yaw)):
        frame = render_frame(
            width_m, depth_m, height_m, eye, look, k, np.zeros(5), image_size, board_img, board_origin, yaw
        )
        frame = apply_distortion(frame, k, dist)
        noise = rng.normal(0, 3.5, frame.shape).astype(np.int16)
        frame = np.clip(frame.astype(np.int16) + noise, 0, 255).astype(np.uint8)
        if index % 4 == 0:
            frame = cv2.GaussianBlur(frame, (3, 3), 0.6)
        ok, buf = cv2.imencode(".jpg", frame, [int(cv2.IMWRITE_JPEG_QUALITY), 78])
        if not ok:
            raise RuntimeError("jpeg encode failed")
        frame = cv2.imdecode(buf, cv2.IMREAD_COLOR)
        cv2.imwrite(str(frames_dir / f"frame_{index:02d}.jpg"), frame)
        writer.write(frame)
    writer.release()
    truth = {
        "id": case_id,
        "kind": "synthetic_pinhole",
        "notes": "Rendered room with JPEG noise and radial distortion. Tape-equivalent truth is the mesh, not a physical tape.",
        "withBoard": with_board,
        "dimensions": [
            {"id": "width", "kind": "wall_length", "label": "width", "valueFt": width_ft},
            {"id": "depth", "kind": "wall_length", "label": "depth", "valueFt": depth_ft},
            {"id": "height", "kind": "ceiling_height", "label": "ceiling", "valueFt": height_ft},
            {"id": "area", "kind": "floor_area", "label": "floor", "valueFt": round(width_ft * depth_ft, 4)},
        ],
        "doorHeightIn": 80,
        "video": "walkthrough.mp4",
    }
    (out_dir / "truth.json").write_text(json.dumps(truth, indent=2))
    return truth


if __name__ == "__main__":
    case = build_case(Path("eval/cases/synthetic-rect-charuco"))
    print(json.dumps(case, indent=2))
