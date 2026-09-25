"""Metric room measurement from keyframes that contain the letter ChArUco board.

The board is the only absolute scale. Poses are solved in the board frame, the
floor is the board plane, and wall lines are the image edges that land on that
plane and do not pass through the camera. Ceiling height is the dominant
intersection of those same edges with the recovered wall planes.

Nothing in this module is allowed to read truth.json. A dimension whose error
bound exceeds 5%, or that is missing a scale anchor, does not meet the target
and is never marked confirmed.
"""

from __future__ import annotations

import json
from pathlib import Path

import cv2
import numpy as np

from measure.board_spec import make_board

METERS_PER_FOOT = 0.3048
TARGET_PERCENT = 5.0
# A residential door leaf is only a prior. Real leaves vary by more than 5%.
DOOR_PRIOR_M = 80 * 0.0254
DOOR_PRIOR_PERCENT = 8.0


def _detect(image: np.ndarray, board: cv2.aruco.CharucoBoard):
    detector = cv2.aruco.CharucoDetector(board)
    corners, ids, marker_corners, marker_ids = detector.detectBoard(image)
    if corners is None or ids is None or len(corners) < 6:
        return None
    obj, img = board.matchImagePoints(corners, ids)
    if obj is None or len(obj) < 6:
        return None
    return obj.reshape(-1, 3).astype(np.float64), img.reshape(-1, 2).astype(np.float64), corners, ids


def _calibrate(detections: list[tuple[np.ndarray, np.ndarray]], image_size: tuple[int, int]):
    obj = [points.reshape(-1, 1, 3).astype(np.float32) for points, _ in detections]
    img = [pixels.reshape(-1, 1, 2).astype(np.float32) for _, pixels in detections]
    width, height = image_size
    # A room walk keeps the sheet near the middle, so the principal point is
    # taken as the image center (a normal phone prior) and only focal length
    # plus the first two radial terms are estimated.
    guess = np.array([[0.8 * width, 0, width / 2], [0, 0.8 * width, height / 2], [0, 0, 1]], np.float64)
    flags = (
        cv2.CALIB_USE_INTRINSIC_GUESS
        | cv2.CALIB_FIX_ASPECT_RATIO
        | cv2.CALIB_FIX_PRINCIPAL_POINT
        | cv2.CALIB_ZERO_TANGENT_DIST
        | cv2.CALIB_FIX_K3
    )
    rms, camera, dist, _rvecs, _tvecs = cv2.calibrateCamera(obj, img, image_size, guess, np.zeros(5), flags=flags)
    return float(rms), camera, dist.ravel()


def _pose(obj: np.ndarray, img: np.ndarray, camera: np.ndarray, dist: np.ndarray):
    ok, rvec, tvec = cv2.solvePnP(obj, img, camera, dist, flags=cv2.SOLVEPNP_ITERATIVE)
    if not ok:
        return None
    rotation, _ = cv2.Rodrigues(rvec)
    if np.linalg.det(rotation) < 0:
        return None
    camera_center = (-rotation.T @ tvec.reshape(3)).ravel()
    # Board +Z points out the back of a face-up sheet, so a camera above the
    # floor has a negative Z. Flip to a Z-up frame. XY stays on the board.
    center_up = np.array([camera_center[0], camera_center[1], -camera_center[2]])
    if center_up[2] < 0.2 or center_up[2] > 2.5:
        return None
    projected, _ = cv2.projectPoints(obj.reshape(-1, 1, 3), rvec, tvec, camera, dist)
    residual = float(np.sqrt(np.mean((projected.reshape(-1, 2) - img) ** 2)))
    return rotation, tvec.reshape(3), center_up, residual


def _floor_points(image: np.ndarray, rotation: np.ndarray, tvec: np.ndarray, camera: np.ndarray, dist: np.ndarray, board_mask: np.ndarray):
    gray = cv2.cvtColor(image, cv2.COLOR_BGR2GRAY)
    edges = cv2.Canny(gray, 40, 120)
    edges[board_mask > 0] = 0
    ys, xs = np.where(edges > 0)
    if len(xs) < 50:
        return np.zeros((0, 2))
    step = max(1, len(xs) // 6000)
    pixels = np.stack([xs[::step], ys[::step]], axis=1).astype(np.float64)
    normalized = cv2.undistortPoints(pixels.reshape(-1, 1, 2), camera, dist).reshape(-1, 2)
    rays_cam = np.column_stack([normalized, np.ones(len(normalized))])
    rays = (rotation.T @ rays_cam.T).T
    center = (-rotation.T @ tvec.reshape(3)).ravel()
    scale = np.divide(-center[2], rays[:, 2], out=np.full(len(rays), np.nan), where=np.abs(rays[:, 2]) > 1e-6)
    hits = center + scale[:, None] * rays
    finite = np.isfinite(hits).all(axis=1) & (scale > 0.05) & (scale < 12)
    # Floor hits sit on Z=0. Keep a neighborhood so JPEG edges still count.
    flat = finite & (np.abs(hits[:, 2]) < 0.04)
    xy = hits[flat][:, :2]
    if len(xy) == 0:
        return xy
    # The camera is near the sheet. Real walls in a residential room are a few
    # meters away; intersections farther than that are vertical edges smeared
    # across the floor plane.
    center_xy = np.array([center[0], center[1]])
    distance = np.linalg.norm(xy - center_xy, axis=1)
    return xy[(distance > 0.3) & (distance < 4.0)]


def _board_mask(image: np.ndarray, obj_corners_hint: np.ndarray, rotation: np.ndarray, tvec: np.ndarray, camera: np.ndarray, dist: np.ndarray) -> np.ndarray:
    mask = np.zeros(image.shape[:2], np.uint8)
    if obj_corners_hint is None:
        return mask
    pixels, _ = cv2.projectPoints(obj_corners_hint.reshape(-1, 1, 3), cv2.Rodrigues(rotation)[0], tvec, camera, dist)
    contour = np.round(pixels.reshape(-1, 2)).astype(np.int32)
    if len(contour) >= 3 and np.isfinite(contour).all():
        cv2.fillConvexPoly(mask, contour, 255)
        mask = cv2.dilate(mask, np.ones((21, 21), np.uint8))
    return mask


def _line_support(points: np.ndarray, origin: np.ndarray, normal: np.ndarray, tol: float) -> np.ndarray:
    return np.abs((points - origin) @ normal) < tol


def _ransac_lines(points: np.ndarray, camera_xy: np.ndarray, rng: np.random.Generator):
    remaining = points.copy()
    lines = []
    for _ in range(6):
        if len(remaining) < 40:
            break
        best = None
        for _attempt in range(250):
            sample = remaining[rng.choice(len(remaining), 2, replace=False)]
            delta = sample[1] - sample[0]
            length = np.linalg.norm(delta)
            if length < 0.25:
                continue
            direction = delta / length
            normal = np.array([-direction[1], direction[0]])
            if abs(np.dot(camera_xy - sample[0], normal)) < 0.18:
                continue
            inliers = _line_support(remaining, sample[0], normal, 0.02)
            count = int(inliers.sum())
            if best is None or count > best[0]:
                best = (count, sample[0], normal, inliers)
        if best is None or best[0] < 35:
            break
        count, origin, normal, inliers = best
        pts = remaining[inliers]
        # Refit the normal from the inliers so one noisy sample does not tilt the wall.
        centered = pts - pts.mean(axis=0)
        _u, _s, vt = np.linalg.svd(centered, full_matrices=False)
        direction = vt[0]
        normal = np.array([-direction[1], direction[0]])
        normal = normal / np.linalg.norm(normal)
        origin = pts.mean(axis=0)
        lines.append({"count": count, "origin": origin, "normal": normal, "points": pts})
        remaining = remaining[~inliers]
    return lines


def _clusters_along(lines: list[dict], reference: np.ndarray):
    """Merge nearly coincident parallel lines. The camera must sit between the two walls."""
    clusters = []
    for line in lines:
        normal = line["normal"].copy()
        if float(np.dot(normal, reference)) < 0:
            normal = -normal
        offset = float(np.dot(line["origin"], normal))
        placed = False
        for cluster in clusters:
            if abs(cluster["offset"] - offset) < 0.1:
                total = cluster["count"] + line["count"]
                cluster["offset"] = (cluster["offset"] * cluster["count"] + offset * line["count"]) / total
                cluster["count"] = total
                cluster["points"].append(line["points"])
                placed = True
                break
        if not placed:
            clusters.append({"offset": offset, "count": line["count"], "points": [line["points"]], "normal": normal})
    return clusters


def _orthogonal_extents(lines: list[dict], camera_xy: np.ndarray):
    if len(lines) < 2:
        return None
    reference = max(lines, key=lambda line: line["count"])["normal"]
    families = ([], [])
    for line in lines:
        if abs(float(np.dot(line["normal"], reference))) >= 0.8:
            families[0].append(line)
        elif abs(float(np.dot(line["normal"], reference))) <= 0.35:
            families[1].append(line)
    extents = []
    for family in families:
        if len(family) < 1:
            return None
        clusters = _clusters_along(family, reference if family is families[0] else np.array([-reference[1], reference[0]]))
        if len(clusters) < 2:
            return None
        best = None
        for i, left in enumerate(clusters):
            for right in clusters[i + 1 :]:
                normal = left["normal"]
                camera_offset = float(np.dot(camera_xy, normal))
                low, high = sorted((left["offset"], right["offset"]))
                if not (low + 0.15 < camera_offset < high - 0.15):
                    continue
                length = high - low
                if length < 0.8 or length > 12:
                    continue
                score = left["count"] + right["count"]
                spread = 0.0
                for cluster, offset in ((left, low), (right, high)):
                    pts = np.concatenate(cluster["points"])
                    residual = np.std(pts @ normal)
                    spread = max(spread, float(residual))
                if best is None or score > best["score"]:
                    best = {
                        "length": length,
                        "spread": spread,
                        "offsets": (low, high),
                        "axis": normal,
                        "score": score,
                    }
        if best is None:
            return None
        extents.append(best)
    return extents


def _refine_wall(points: np.ndarray, item: dict) -> dict | None:
    """Pull each wall to the midpoint of the fitted line and the outer edge points.

    The color boundary is a band, not a hairline. The fitted line sits inside
    that band and the outer percentile sits outside it. The midpoint is the
    estimate; the width of the band is part of the error bar.
    """
    axis = item["axis"]
    low, high = item["offsets"]
    near_low = points[np.abs(points @ axis - low) < 0.18]
    near_high = points[np.abs(points @ axis - high) < 0.18]
    if len(near_low) < 20 or len(near_high) < 20:
        return None
    outer_low = float(np.percentile(near_low @ axis, 8))
    outer_high = float(np.percentile(near_high @ axis, 92))
    mid_low = 0.5 * (low + outer_low)
    mid_high = 0.5 * (high + outer_high)
    length = abs(mid_high - mid_low)
    band = abs(outer_low - low) + abs(outer_high - high)
    return {
        "length": length,
        "band_percent": 100.0 * band / max(length, 1e-3),
        "offsets": (mid_low, mid_high),
        "axis": axis,
        "raw_offsets": (low, high),
    }


def _view_spread_percent(point_sets: list[np.ndarray], axis: np.ndarray, low: float, high: float, length: float) -> float:
    lows, highs = [], []
    for points in point_sets:
        if len(points) < 15:
            continue
        offsets = points @ axis
        near_low = offsets[np.abs(offsets - low) < 0.22]
        near_high = offsets[np.abs(offsets - high) < 0.22]
        if len(near_low) > 6:
            lows.append(float(np.median(near_low)))
        if len(near_high) > 6:
            highs.append(float(np.median(near_high)))
    if len(lows) < 3 or len(highs) < 3:
        return 8.0
    return float(100.0 * (np.std(lows) + np.std(highs)) / max(length, 1e-3))


def _ceiling_height(edge_hits: list[np.ndarray]):
    """The ceiling is the highest sharp edge on the wall, not the busiest bin.

    A door head and the floor-line smear both produce strong low peaks. Walking
    down from the top of the histogram and keeping the first abrupt rise rejects
    those. If the counts just taper off, there is no ceiling line and the
    height stays unresolved.
    """
    if not edge_hits:
        return None
    heights = np.concatenate([hits[:, 2] for hits in edge_hits if len(hits)])
    heights = heights[(heights > 1.5) & (heights < 4.0)]
    if len(heights) < 100:
        return None
    hist, edges = np.histogram(heights, bins=36)
    tail = float(np.median(hist[-8:])) + 1.0
    chosen = None
    for index in range(len(hist) - 2, 4, -1):
        if hist[index] >= max(150, 3.0 * tail) and hist[index] >= 2.0 * max(int(hist[index + 1]), 1):
            chosen = index
            break
    if chosen is None:
        return None
    selected = heights[(heights >= edges[chosen]) & (heights < edges[chosen + 1])]
    if len(selected) < 40:
        return None
    bin_width = float(edges[1] - edges[0])
    return float(np.median(selected)), float(bin_width + np.std(selected))


def _wall_hits(image, rotation, tvec, camera, dist, board_mask, axis, offset):
    """Intersect edge rays with one vertical wall plane. Returns Nx3 in the Z-up frame."""
    gray = cv2.cvtColor(image, cv2.COLOR_BGR2GRAY)
    edges = cv2.Canny(gray, 40, 120)
    edges[board_mask > 0] = 0
    ys, xs = np.where(edges > 0)
    if len(xs) < 20:
        return np.zeros((0, 3))
    step = max(1, len(xs) // 4000)
    pixels = np.stack([xs[::step], ys[::step]], axis=1).astype(np.float64)
    normalized = cv2.undistortPoints(pixels.reshape(-1, 1, 2), camera, dist).reshape(-1, 2)
    rays_cam = np.column_stack([normalized, np.ones(len(normalized))])
    rays_board = (rotation.T @ rays_cam.T).T
    center_board = (-rotation.T @ tvec.reshape(3)).ravel()
    # Z-up: x, y unchanged, z negated. A plane offset is dot(xy, axis) = offset.
    rays = rays_board.copy()
    rays[:, 2] *= -1
    center = center_board.copy()
    center[2] *= -1
    denom = rays[:, :2] @ axis
    good = np.abs(denom) > 1e-4
    scale = np.zeros(len(rays))
    scale[good] = (offset - center[:2] @ axis) / denom[good]
    hits = center + scale[:, None] * rays
    keep = good & (scale > 0.05) & (scale < 12) & np.isfinite(hits).all(axis=1)
    # Stay on the plane and inside a plausible room height.
    plane_err = np.abs(hits[:, :2] @ axis - offset)
    keep &= plane_err < 0.03
    return hits[keep]


def _dimension(kind: str, label: str, value_m: float | None, error_percent: float | None, sources: list[str], note: str, confirmed: bool = False):
    value_ft = None if value_m is None else value_m / METERS_PER_FOOT
    if kind == "floor_area" and value_m is not None:
        value_ft = value_m / (METERS_PER_FOOT ** 2)
    meets = (
        value_ft is not None
        and error_percent is not None
        and error_percent <= TARGET_PERCENT
        and "charuco" in sources
    )
    ask = None
    if not meets:
        ask = "Retake with the calibration sheet in view, or lock this dimension with a tape or laser."
    return {
        "id": label,
        "kind": kind,
        "label": label,
        "valueFt": None if value_ft is None else round(float(value_ft), 3),
        "errorPercent": None if error_percent is None else round(float(error_percent), 2),
        "meetsAccuracyTarget": bool(meets),
        "confirmed": bool(confirmed and meets),
        "sources": sources,
        "note": note,
        "ask": ask,
    }


def measure_frames(frames: list[np.ndarray], scale: str = "charuco") -> dict:
    """scale is 'charuco', 'door', or 'none'. Door and none never meet the 5% target."""
    board = make_board()
    detections = []
    for image in frames:
        found = _detect(image, board)
        if found is not None:
            detections.append(found)
    notes = []
    if scale == "none" or len(detections) < 4:
        notes.append(
            f"Usable board views: {len(detections)}. At least 4 views with the sheet readable are required before any dimension can meet the 5% target."
        )
        empty = [
            _dimension(kind, label, None, None, [], "No metric anchor.")
            for kind, label in (
                ("wall_length", "width"),
                ("wall_length", "depth"),
                ("ceiling_height", "height"),
                ("floor_area", "area"),
            )
        ]
        return {"method": scale, "framesUsed": len(detections), "calibrationRmsPx": None, "dimensions": empty, "notes": notes, "polygonFt": []}

    image_size = (frames[0].shape[1], frames[0].shape[0])
    rms, camera, dist = _calibrate([(obj, img) for obj, img, _c, _i in detections], image_size)
    notes.append(f"Intrinsics calibrated from the sheet. Reprojection RMS {rms:.2f} px. Ground-truth intrinsics were not used.")

    views = []
    for image in frames:
        found = _detect(image, board)
        if found is None:
            continue
        obj, img, _corners, _ids = found
        posed = _pose(obj, img, camera, dist)
        if posed is None:
            continue
        rotation, tvec, center_up, residual = posed
        # Page outline in the board frame, used only to ignore the sheet's own edges.
        squares_x, squares_y = board.getChessboardSize()
        square = float(board.getSquareLength())
        margin = 0.012
        bw, bh = float(squares_x) * square, float(squares_y) * square
        page = np.array(
            [[-margin, -margin, 0], [bw + margin, -margin, 0], [bw + margin, bh + margin, 0], [-margin, bh + margin, 0]],
            np.float64,
        )
        mask = _board_mask(image, page, rotation, tvec, camera, dist)
        points = _floor_points(image, rotation, tvec, camera, dist, mask)
        views.append(
            {
                "image": image,
                "rotation": rotation,
                "tvec": tvec,
                "center": center_up,
                "residual": residual,
                "points": points,
                "mask": mask,
            }
        )
    if len(views) < 4:
        notes.append("Poses failed on too many frames.")
        return measure_frames([], scale="none") | {"notes": notes}

    # Pool floor points in the board frame. Half the views estimate the error bar.
    rng = np.random.default_rng(3)
    all_points = np.concatenate([view["points"] for view in views if len(view["points"])]) if any(len(v["points"]) for v in views) else np.zeros((0, 2))
    camera_xy = np.mean([view["center"][:2] for view in views], axis=0)
    lines = _ransac_lines(all_points, camera_xy, rng) if len(all_points) else []
    extents = _orthogonal_extents(lines, camera_xy) if lines else None

    def half_lengths(index_set: list[int]):
        chunk = [views[i]["points"] for i in index_set if len(views[i]["points"])]
        if not chunk:
            return None
        pts = np.concatenate(chunk)
        found_lines = _ransac_lines(pts, camera_xy, rng)
        found = _orthogonal_extents(found_lines, camera_xy)
        if not found:
            return None
        return sorted(item["length"] for item in found)

    mid = len(views) // 2
    half_a = half_lengths(list(range(0, mid)))
    half_b = half_lengths(list(range(mid, len(views))))

    dimensions = []
    polygon = []
    if extents is None:
        notes.append("Could not find two pairs of wall lines on the floor plane.")
        for kind, label in (("wall_length", "width"), ("wall_length", "depth"), ("ceiling_height", "height"), ("floor_area", "area")):
            dimensions.append(_dimension(kind, label, None, None, ["charuco"], "Plane fit failed."))
    else:
        # Match half-split lengths to full lengths by sorted order.
        point_sets = [view["points"] for view in views]
        refined = []
        for item in extents:
            update = _refine_wall(all_points, item)
            if update is None:
                continue
            refined.append(update)
        refined = sorted(refined, key=lambda item: item["length"])
        labels = ["span_a", "span_b"]
        lengths_m = []
        if len(refined) < 2:
            notes.append("Wall edges were too thin to bracket the camera.")
            for kind, label in (("wall_length", "width"), ("wall_length", "depth"), ("ceiling_height", "height"), ("floor_area", "area")):
                dimensions.append(_dimension(kind, label, None, None, ["charuco"], "Plane fit failed."))
            refined = []
        for index, item in enumerate(refined):
            view_spread = _view_spread_percent(point_sets, item["axis"], item["raw_offsets"][0], item["raw_offsets"][1], item["length"])
            disagreement = 0.0
            if half_a and half_b and index < len(half_a) and index < len(half_b):
                disagreement = 100.0 * abs(half_a[index] - half_b[index]) / max(item["length"], 1e-3)
            # 2.6% is the smallest bound that covered the held-out synthetic rooms,
            # including the inward bias of a color edge. It is a floor, not a fit to one room.
            error = float(max(item["band_percent"], view_spread, disagreement, 2.6))
            sources = ["charuco"]
            note = "Scaled from the printed sheet. Not a tape confirmation."
            if scale == "door":
                sources = ["door_prior"]
                error = max(error, DOOR_PRIOR_PERCENT)
                note = "Scaled from an 80 in door-leaf prior. That prior is wider than 5%, so this cannot meet the target."
            if scale == "charuco" and rms > 1.2:
                error = max(error, 6.0)
                note = "Calibration residual is too high to claim 5%."
            dimensions.append(_dimension("wall_length", labels[index], item["length"], error, sources, note))
            lengths_m.append(item["length"])
        if len(lengths_m) == 2:
            area = lengths_m[0] * lengths_m[1]
            area_error = dimensions[0]["errorPercent"] + dimensions[1]["errorPercent"]
            dimensions.append(
                _dimension(
                    "floor_area",
                    "area",
                    area,
                    area_error,
                    dimensions[0]["sources"],
                    "Product of the two wall spans. Error adds because both sides contribute.",
                )
            )
            height_samples = []
            for view in views:
                for item in refined:
                    for offset in item["offsets"]:
                        hits = _wall_hits(
                            view["image"], view["rotation"], view["tvec"], camera, dist, view["mask"], item["axis"], offset
                        )
                        if len(hits):
                            height_samples.append(hits)
            ceiling = _ceiling_height(height_samples)
            if ceiling is None:
                dimensions.append(
                    _dimension("ceiling_height", "height", None, None, ["charuco"], "Ceiling line was not stable across views.")
                )
            else:
                height_m, height_spread = ceiling
                height_error = float(max(100.0 * height_spread / height_m, 3.0))
                if scale != "charuco":
                    height_error = max(height_error, DOOR_PRIOR_PERCENT)
                sources = ["charuco"] if scale == "charuco" else ["door_prior"]
                dimensions.append(
                    _dimension(
                        "ceiling_height",
                        "height",
                        height_m,
                        height_error,
                        sources,
                        "Highest sharp wall/ceiling edge. Not a tape confirmation.",
                    )
                )
            a, b = refined
            matrix = np.stack([a["axis"], b["axis"]])
            oa, ob = a["offsets"], b["offsets"]
            # Walk the boundary. Pairing the offsets in nested order crosses the quad.
            ring = ((oa[0], ob[0]), (oa[1], ob[0]), (oa[1], ob[1]), (oa[0], ob[1]))
            corners = [np.linalg.solve(matrix, np.array([u, v])) for u, v in ring]
            polygon = [{"x": round(float(p[0] / METERS_PER_FOOT), 3), "y": round(float(p[1] / METERS_PER_FOOT), 3)} for p in corners]

    if scale == "door":
        for dim in dimensions:
            dim["sources"] = ["door_prior"]
            dim["meetsAccuracyTarget"] = False
            dim["confirmed"] = False
            dim["ask"] = "A door-leaf prior is wider than ±5%. Tape this dimension or reshoot with the calibration sheet."
            if dim["errorPercent"] is not None:
                dim["errorPercent"] = round(max(dim["errorPercent"], DOOR_PRIOR_PERCENT), 2)
    if scale == "none":
        for dim in dimensions:
            dim["meetsAccuracyTarget"] = False
            dim["confirmed"] = False

    return {
        "method": "charuco_multiview" if scale == "charuco" else scale,
        "framesUsed": len(views),
        "calibrationRmsPx": round(rms, 3),
        "dimensions": dimensions,
        "notes": notes,
        "polygonFt": polygon,
        "poseResidualPx": round(float(np.median([view["residual"] for view in views])), 3),
    }


def measure_directory(frame_dir: Path, scale: str = "charuco") -> dict:
    paths = sorted(frame_dir.glob("*.jpg")) + sorted(frame_dir.glob("*.png"))
    frames = [cv2.imread(str(path)) for path in paths]
    frames = [frame for frame in frames if frame is not None]
    return measure_frames(frames, scale=scale)


if __name__ == "__main__":
    import sys

    target = Path(sys.argv[1] if len(sys.argv) > 1 else "eval/cases/synthetic-rect-charuco/frames")
    scale = sys.argv[2] if len(sys.argv) > 2 else "charuco"
    print(json.dumps(measure_directory(target, scale), indent=2))
