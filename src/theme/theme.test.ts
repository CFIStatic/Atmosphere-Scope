import { describe, expect, it } from "vitest";
import { ACCENT, contrastRatio, DARK_BG, DARK_INK, DARK_MUTED, LIGHT_ACCENT_INK, LIGHT_CARD, LIGHT_INK, LIGHT_MUTED, LIGHT_PAPER, ON_ACCENT } from "@/theme/contrast";
import { THEME_BOOT, THEME_STORAGE_KEY, cycleThemePreference, coerceThemePreference } from "@/theme/theme";
import { blankDefaults, cleanDefaults, listCostUsd } from "@/domain/workspace";

describe("theme", () => {
  it("toggles light and dark and boots from atmosphere.theme", () => {
    expect(cycleThemePreference("dark")).toBe("light");
    expect(cycleThemePreference("light")).toBe("dark");
    expect(coerceThemePreference("system")).toBe("dark");
    expect(THEME_STORAGE_KEY).toBe("atmosphere.theme");
    expect(THEME_BOOT).toContain("atmosphere.theme");
    expect(THEME_BOOT).toContain("prefers-color-scheme: dark");
  });

  it("keeps AA contrast for both palettes", () => {
    expect(contrastRatio(DARK_INK, DARK_BG)).toBeGreaterThanOrEqual(4.5);
    expect(contrastRatio(DARK_MUTED, DARK_BG)).toBeGreaterThanOrEqual(4.5);
    expect(contrastRatio(ACCENT, DARK_BG)).toBeGreaterThanOrEqual(4.5);
    expect(contrastRatio(ON_ACCENT, ACCENT)).toBeGreaterThanOrEqual(4.5);
    expect(contrastRatio(LIGHT_INK, LIGHT_PAPER)).toBeGreaterThanOrEqual(4.5);
    expect(contrastRatio(LIGHT_INK, LIGHT_CARD)).toBeGreaterThanOrEqual(4.5);
    expect(contrastRatio(LIGHT_MUTED, LIGHT_PAPER)).toBeGreaterThanOrEqual(4.5);
    expect(contrastRatio(LIGHT_MUTED, LIGHT_CARD)).toBeGreaterThanOrEqual(4.5);
    expect(contrastRatio(LIGHT_ACCENT_INK, LIGHT_PAPER)).toBeGreaterThanOrEqual(4.5);
    expect(contrastRatio(LIGHT_ACCENT_INK, LIGHT_CARD)).toBeGreaterThanOrEqual(4.5);
    expect(contrastRatio(ON_ACCENT, ACCENT)).toBeGreaterThanOrEqual(4.5);
  });
});

describe("estimate defaults", () => {
  it("leaves empty rates empty and does not invent a price", () => {
    expect(blankDefaults("org").taxRate).toBe("");
    expect(blankDefaults("org").laborRates).toEqual([]);
    const cleaned = cleanDefaults("org", { taxRate: "", overheadPct: "10", profitPct: "", priceListRegion: "  ", laborRates: [{ id: "a", name: "Painter", rate: "" }] });
    expect(cleaned.taxRate).toBe("");
    expect(cleaned.overheadPct).toBe("10");
    expect(cleaned.profitPct).toBe("");
    expect(cleaned.priceListRegion).toBe("");
    expect(cleaned.laborRates[0]?.rate).toBe("");
    expect(listCostUsd("unknown-model", 100, 100)).toBeNull();
    expect(listCostUsd("gpt-4o-mini", null, null)).toBeNull();
  });
});
