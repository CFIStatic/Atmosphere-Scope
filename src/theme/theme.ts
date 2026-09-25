export type ThemePreference = "light" | "dark";

export const THEME_STORAGE_KEY = "atmosphere.theme";

export function isThemePreference(value: unknown): value is ThemePreference {
  return value === "light" || value === "dark";
}

export function cycleThemePreference(current: ThemePreference): ThemePreference {
  return current === "dark" ? "light" : "dark";
}

export function themeLabel(preference: ThemePreference): string {
  return preference === "light" ? "Light" : "Dark";
}

export function readThemePreference(): ThemePreference {
  if (typeof window === "undefined") return "dark";
  try {
    const stored = window.localStorage.getItem(THEME_STORAGE_KEY);
    if (isThemePreference(stored)) return stored;
  } catch {
    /* private mode */
  }
  return "dark";
}

export function applyTheme(preference: ThemePreference): void {
  if (typeof document === "undefined") return;
  document.documentElement.setAttribute("data-theme", preference);
  document.documentElement.setAttribute("data-theme-preference", preference);
}

export function setThemePreference(preference: ThemePreference): void {
  applyTheme(preference);
  try {
    window.localStorage.setItem(THEME_STORAGE_KEY, preference);
  } catch {
    /* storage unavailable */
  }
}
