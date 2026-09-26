function channel(value: number): number {
  const scaled = value / 255;
  return scaled <= 0.04045 ? scaled / 12.92 : ((scaled + 0.055) / 1.055) ** 2.4;
}

export function contrastRatio(foreground: [number, number, number], background: [number, number, number]): number {
  const luminance = (rgb: [number, number, number]) => 0.2126 * channel(rgb[0]) + 0.7152 * channel(rgb[1]) + 0.0722 * channel(rgb[2]);
  const lighter = Math.max(luminance(foreground), luminance(background));
  const darker = Math.min(luminance(foreground), luminance(background));
  return (lighter + 0.05) / (darker + 0.05);
}

/** Yellow fill stays #f5c518. Text on it is near-black. Text on paper uses a darker yellow. */
export const ACCENT = [245, 197, 24] as [number, number, number];
export const ON_ACCENT = [24, 25, 27] as [number, number, number];
export const DARK_BG = [24, 25, 27] as [number, number, number];
export const DARK_INK = [246, 245, 241] as [number, number, number];
export const DARK_MUTED = [168, 168, 166] as [number, number, number];
export const LIGHT_PAPER = [244, 241, 235] as [number, number, number];
export const LIGHT_CARD = [255, 255, 255] as [number, number, number];
export const LIGHT_INK = [28, 25, 23] as [number, number, number];
export const LIGHT_MUTED = [87, 83, 78] as [number, number, number];
export const LIGHT_ACCENT_INK = [122, 98, 0] as [number, number, number];
