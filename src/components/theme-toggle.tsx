"use client";

import { useEffect, useState } from "react";
import { cycleThemePreference, readThemePreference, setThemePreference, type ThemePreference } from "@/theme/theme";

export function ThemeToggle() {
  const [theme, setTheme] = useState<ThemePreference>("light");

  useEffect(() => {
    setTheme(readThemePreference());
  }, []);

  const next = theme === "light" ? "dark" : "light";
  return (
    <button
      type="button"
      className="theme-toggle"
      aria-label={theme === "light" ? "Switch to dark mode" : "Switch to light mode"}
      title={theme === "light" ? "Light mode. Click for dark." : "Dark mode. Click for light."}
      onClick={() => {
        const value = cycleThemePreference(theme);
        setTheme(value);
        setThemePreference(value);
      }}
    >
      {theme === "light" ? <MoonIcon /> : <SunIcon />}
      <span className="sr-only">{next}</span>
    </button>
  );
}

function MoonIcon() {
  return (
    <svg width="15" height="15" viewBox="0 0 16 16" fill="none" aria-hidden="true">
      <path d="M13.5 9.5A6 6 0 0 1 6.5 2.5a6 6 0 1 0 7 7Z" stroke="currentColor" strokeWidth="1.4" strokeLinejoin="round" />
    </svg>
  );
}

function SunIcon() {
  return (
    <svg width="15" height="15" viewBox="0 0 16 16" fill="none" aria-hidden="true">
      <circle cx="8" cy="8" r="3.2" stroke="currentColor" strokeWidth="1.4" />
      <path d="M8 1v1.8M8 13.2V15M15 8h-1.8M2.8 8H1M12.95 3.05l-1.27 1.27M4.32 11.68l-1.27 1.27M12.95 12.95l-1.27-1.27M4.32 4.32 3.05 3.05" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" />
    </svg>
  );
}
