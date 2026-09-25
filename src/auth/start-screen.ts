export const START_COOKIE = "scope_start";

export type StartScreen = "record" | "jobs";

export function parseStartScreen(value: string | null | undefined): StartScreen {
  return value === "jobs" ? "jobs" : "record";
}

export function startPath(screen: StartScreen): "/record" | "/jobs" {
  return screen === "jobs" ? "/jobs" : "/record";
}

export function startStorageKey(email: string): string {
  return `atmosphere-start:${email.trim().toLowerCase()}`;
}

export function storedStartScreen(email: string): StartScreen {
  if (typeof localStorage === "undefined" || !email.trim()) return "record";
  return parseStartScreen(localStorage.getItem(startStorageKey(email)));
}

export function writeStartScreen(email: string, screen: StartScreen) {
  if (typeof document === "undefined") return;
  const secure = location.protocol === "https:" ? "; secure" : "";
  document.cookie = `${START_COOKIE}=${screen}; path=/; max-age=31536000; samesite=lax${secure}`;
  if (typeof localStorage !== "undefined" && email.trim()) localStorage.setItem(startStorageKey(email), screen);
}

export function applyStartScreenForEmail(email: string) {
  writeStartScreen(email, storedStartScreen(email));
}
