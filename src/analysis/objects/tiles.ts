import type { BoundingBox } from "@/domain/types";
import type { TileRef } from "./detect";

/**
 * High-resolution frames are read as the full frame plus a grid of crops.
 * Atmosphere sampled whole frames (`verification/frames/extract.ts`). Scope
 * keeps that sample, then adds crops so a duplex outlet is not lost in a wide shot.
 * Object count is not capped here. The grid is a fixed 2×2 plus the full frame.
 */
export function planTiles(rows = 2, cols = 2): TileRef[] {
  const tiles: TileRef[] = [];
  for (let row = 0; row < rows; row += 1) {
    for (let col = 0; col < cols; col += 1) tiles.push({ row, col, rows, cols });
  }
  return tiles;
}

export function tileLabel(tile: TileRef | null): string | null {
  if (!tile) return null;
  return `r${tile.row}c${tile.col}`;
}

/** ffmpeg crop filter for a normalized full-frame box. Even pixels keep yuv420 valid. */
export function cropFilter(box: BoundingBox, width: number, height: number): string {
  const even = (value: number, limit: number) => {
    const next = Math.max(2, Math.round(value));
    const snapped = next - (next % 2);
    return Math.min(limit - (limit % 2 === 0 ? 0 : 1), Math.max(2, snapped));
  };
  const cropW = even(box.width * width, width);
  const cropH = even(box.height * height, height);
  const x = Math.max(0, Math.min(width - cropW, Math.round(box.x * width)));
  const y = Math.max(0, Math.min(height - cropH, Math.round(box.y * height)));
  return `crop=${cropW}:${cropH}:${x}:${y}`;
}

/** Expand a full-frame box so the crop includes a little context, then clamp it to the frame. */
export function paddedFrameBox(box: BoundingBox, pad = 0.08): BoundingBox {
  const x = Math.max(0, box.x - pad);
  const y = Math.max(0, box.y - pad);
  const right = Math.min(1, box.x + box.width + pad);
  const bottom = Math.min(1, box.y + box.height + pad);
  return { x, y, width: Math.max(0, right - x), height: Math.max(0, bottom - y) };
}

export function tileBox(tile: TileRef): BoundingBox {
  return {
    x: tile.col / tile.cols,
    y: tile.row / tile.rows,
    width: 1 / tile.cols,
    height: 1 / tile.rows,
  };
}
