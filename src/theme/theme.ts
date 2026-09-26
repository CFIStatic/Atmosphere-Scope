export type ThemePreference = "light" | "dark";

export const THEME_STORAGE_KEY = "atmosphere.theme";
const PREFERENCES_STORAGE_KEY = "atmosphere.preferences";
const LEGACY_WEB_THEME_KEY = "atm-theme";

const listeners = new Set<() => void>();

export function isThemePreference(value: unknown): value is ThemePreference {
  return value === "light" || value === "dark";
}

export function systemResolvedTheme(): ThemePreference {
  if (typeof window === "undefined") return "dark";
  try {
    return window.matchMedia("(prefers-color-scheme: dark)").matches ? "dark" : "light";
  } catch {
    return "dark";
  }
}

export function coerceThemePreference(value: unknown): ThemePreference {
  if (isThemePreference(value)) return value;
  return systemResolvedTheme();
}

export function cycleThemePreference(current: ThemePreference): ThemePreference {
  return current === "dark" ? "light" : "dark";
}

export function readThemePreference(): ThemePreference {
  if (typeof window === "undefined") return "dark";
  try {
    const direct = window.localStorage.getItem(THEME_STORAGE_KEY);
    if (direct != null) return coerceThemePreference(direct);
    const prefsRaw = window.localStorage.getItem(PREFERENCES_STORAGE_KEY);
    if (prefsRaw) {
      const parsed = JSON.parse(prefsRaw) as { theme?: unknown };
      if (parsed.theme != null) return coerceThemePreference(parsed.theme);
    }
    const legacy = window.localStorage.getItem(LEGACY_WEB_THEME_KEY);
    if (legacy === "light" || legacy === "dark") return legacy;
  } catch {
    /* private mode */
  }
  return systemResolvedTheme();
}

export function applyResolvedTheme(preference: ThemePreference): ThemePreference {
  if (typeof document !== "undefined") {
    document.documentElement.setAttribute("data-theme", preference);
    document.documentElement.setAttribute("data-theme-preference", preference);
    const meta = document.querySelector('meta[name="theme-color"]');
    if (meta) meta.setAttribute("content", preference === "light" ? "#f4f1eb" : "#18191b");
  }
  return preference;
}

export function persistThemePreference(preference: ThemePreference): void {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.setItem(THEME_STORAGE_KEY, preference);
    let prefs: Record<string, unknown> = {};
    try {
      const raw = window.localStorage.getItem(PREFERENCES_STORAGE_KEY);
      if (raw) prefs = JSON.parse(raw) as Record<string, unknown>;
    } catch {
      prefs = {};
    }
    window.localStorage.setItem(PREFERENCES_STORAGE_KEY, JSON.stringify({ ...prefs, theme: preference }));
    window.localStorage.setItem(LEGACY_WEB_THEME_KEY, preference);
  } catch {
    /* storage unavailable */
  }
}

export function setThemePreference(preference: ThemePreference): void {
  const stored = isThemePreference(preference) ? preference : systemResolvedTheme();
  applyResolvedTheme(stored);
  persistThemePreference(stored);
  listeners.forEach((listener) => listener());
  if (typeof window !== "undefined" && window.parent !== window) {
    try {
      window.parent.postMessage({ atmosphere: "theme", preference: stored }, "*");
    } catch {
      /* ignore */
    }
  }
}

export function initTheme(): ThemePreference {
  const preference = readThemePreference();
  applyResolvedTheme(preference);
  persistThemePreference(preference);
  return preference;
}

export function subscribeTheme(listener: () => void): () => void {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

/** Runs before paint. Same key and system default as Atmosphere. */
export const THEME_BOOT = `(function(){try{var k="atmosphere.theme";var p=localStorage.getItem(k);if(p!=="light"&&p!=="dark"){var raw=localStorage.getItem("atmosphere.preferences");if(raw){var parsed=JSON.parse(raw);if(parsed&&(parsed.theme==="light"||parsed.theme==="dark"))p=parsed.theme;}if(p!=="light"&&p!=="dark"){var legacy=localStorage.getItem("atm-theme");if(legacy==="light"||legacy==="dark")p=legacy;}}if(p!=="light"&&p!=="dark"){p=matchMedia("(prefers-color-scheme: dark)").matches?"dark":"light";}localStorage.setItem(k,p);document.documentElement.setAttribute("data-theme",p);document.documentElement.setAttribute("data-theme-preference",p);}catch(e){}})();`;
