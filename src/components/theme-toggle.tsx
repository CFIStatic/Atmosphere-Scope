"use client";

import { useEffect, useState } from "react";
import { cycleThemePreference, initTheme, setThemePreference, subscribeTheme, type ThemePreference } from "@/theme/theme";

export function ThemeToggle({ id, labeled = false }: { id?: string; labeled?: boolean }) {
  const [theme, setTheme] = useState<ThemePreference>("dark");

  useEffect(() => {
    setTheme(initTheme());
    return subscribeTheme(() => setTheme(initTheme()));
  }, []);

  const next = cycleThemePreference(theme);
  const label = next === "light" ? "Switch to light mode" : "Switch to dark mode";
  const current = theme === "light" ? "Light" : "Dark";
  return (
    <button
      id={id}
      type="button"
      className={labeled ? "theme-menu" : "theme-toggle"}
      aria-label={label}
      title={`Appearance is ${current}. ${label}.`}
      onClick={() => setThemePreference(next)}
    >
      {next === "dark" ? <MoonIcon /> : <SunIcon />}
      {labeled ? <span>Appearance: {current}</span> : null}
    </button>
  );
}

function MoonIcon() {
  return (
    <svg className="icon-moon" width="15" height="15" viewBox="0 0 24 24" fill="none" aria-hidden="true">
      <path d="M16.5 3.5a8.5 8.5 0 1 0 4 12.5A8.5 8.5 0 0 1 16.5 3.5Z" stroke="currentColor" strokeWidth="1.8" strokeLinejoin="round" />
    </svg>
  );
}

function SunIcon() {
  return (
    <svg className="icon-sun" width="15" height="15" viewBox="0 0 24 24" fill="none" aria-hidden="true">
      <circle cx="12" cy="12" r="3.5" stroke="currentColor" strokeWidth="1.8" />
      <path d="M12 3.5v2.2M12 18.3V20.5M4.8 4.8l1.6 1.6M17.6 17.6l1.6 1.6M3.5 12h2.2M18.3 12h2.2M4.8 19.2l1.6-1.6M17.6 6.4l1.6-1.6" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" />
    </svg>
  );
}
