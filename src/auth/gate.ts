export type AccountRole = "admin" | "estimator" | "customer";

export const MIN_PASSWORD_LENGTH = 8;

export const SIGN_IN_ERROR = "Email or password is incorrect.";
export const RESET_SENT = "If an account exists for that email, a reset link is on its way.";
export const CONFIRM_SENT = "If that email is waiting for confirmation, a new link is on its way.";
export const LINK_INVALID = "This link is expired or invalid. Request another reset email.";
export const RATE_LIMITED = "Too many attempts. Wait a few minutes and try again.";

export type AuthDecision =
  | { type: "allow" }
  | { type: "unauthorized" }
  | { type: "redirect"; pathname: string; search: string };

const PUBLIC_PAGES = new Set(["/login", "/signup", "/onboarding", "/forgot", "/auth/callback", "/auth/reset"]);

export function authModeFromStorage(storage: string | undefined): "supabase" | "local" {
  return (storage ?? "").trim().toLowerCase() === "supabase" ? "supabase" : "local";
}

export function isAccountRole(value: unknown): value is AccountRole {
  return value === "admin" || value === "estimator" || value === "customer";
}

export function roleFromAppMetadata(appMetadata: object | null | undefined): AccountRole | null {
  if (!appMetadata || !("role" in appMetadata)) return null;
  const role = (appMetadata as { role?: unknown }).role;
  return isAccountRole(role) ? role : null;
}

export function passwordProblem(password: string): string | null {
  if (password.length < MIN_PASSWORD_LENGTH) return `Use at least ${MIN_PASSWORD_LENGTH} characters.`;
  return null;
}

/** Hint only. A password of 8 characters is still accepted. */
export function passwordHint(password: string): string {
  if (password.length < MIN_PASSWORD_LENGTH) return `Use at least ${MIN_PASSWORD_LENGTH} characters.`;
  const kinds = [/[a-z]/.test(password), /[A-Z]/.test(password), /\d/.test(password)].filter(Boolean).length;
  if (password.length >= 12 && kinds >= 3) return "Strong password.";
  if (password.length >= 10 || kinds >= 2) return "Okay password. A longer mix is stronger.";
  return "Weak password. Add length or a mix of letters and numbers.";
}

export function safeNext(value: string | null | undefined): string {
  if (!value) return "/";
  let path = value;
  try {
    path = decodeURIComponent(value);
  } catch {
    return "/";
  }
  if (!path.startsWith("/") || path.startsWith("//") || path.startsWith("/\\") || path.includes("\\") || path.includes("://")) return "/";
  return path;
}

export function devSignInAllowed(mode: "supabase" | "local"): boolean {
  return mode === "local";
}

export function canSeeJob(input: {
  openCatalog: boolean;
  role: AccountRole | null;
  email: string;
  jobId: string;
  jobOrgId?: string | null;
  viewerOrgId?: string | null;
  shares: { jobId: string; email: string }[];
}): boolean {
  if (input.openCatalog) return true;
  const email = input.email.trim().toLowerCase();
  const shared = input.shares.some((share) => share.jobId === input.jobId && share.email.trim().toLowerCase() === email);
  if (input.role === "customer") return shared;
  if (input.role !== "admin" && input.role !== "estimator") return false;
  if (shared) return true;
  if (input.viewerOrgId) return Boolean(input.jobOrgId) && input.jobOrgId === input.viewerOrgId;
  return !input.jobOrgId;
}

export function canMutateJobs(input: { openCatalog: boolean; role: AccountRole | null }): boolean {
  if (input.openCatalog) return true;
  return input.role === "admin" || input.role === "estimator";
}

function isPublicPage(pathname: string): boolean {
  return PUBLIC_PAGES.has(pathname) || pathname.startsWith("/auth/");
}

function isPublicApi(pathname: string, method: string): boolean {
  if (pathname === "/api/auth/forgot" || pathname === "/api/auth/resend" || pathname === "/api/auth/signup" || pathname === "/api/health") return true;
  if (pathname === "/api/auth/session" && (method === "GET" || method === "POST" || method === "DELETE")) return true;
  return false;
}

export function decideRequest(input: {
  mode: "supabase" | "local";
  pathname: string;
  method: string;
  signedIn: boolean;
  role: AccountRole | null;
  configured: boolean;
}): AuthDecision {
  if (input.mode !== "supabase") return { type: "allow" };
  if (isPublicPage(input.pathname) || isPublicApi(input.pathname, input.method)) {
    if (input.signedIn && input.pathname === "/login") return { type: "redirect", pathname: "/", search: "" };
    return { type: "allow" };
  }
  const api = input.pathname.startsWith("/api/");
  if (!input.configured || !input.signedIn) {
    if (api) return { type: "unauthorized" };
    const next = safeNext(input.pathname);
    const reason = input.configured ? "" : "error=config&";
    return { type: "redirect", pathname: "/login", search: `?${reason}next=${encodeURIComponent(next)}` };
  }
  if (!input.role && input.pathname !== "/account" && input.pathname !== "/settings" && !input.pathname.startsWith("/onboarding")) {
    if (api) return { type: "unauthorized" };
    return { type: "redirect", pathname: "/account", search: "?error=role" };
  }
  if (input.pathname.startsWith("/admin") && input.role !== "admin") {
    if (api) return { type: "unauthorized" };
    return { type: "redirect", pathname: "/account", search: "?error=admin" };
  }
  if (input.role === "customer" && input.pathname === "/jobs/new") {
    return { type: "redirect", pathname: "/", search: "" };
  }
  return { type: "allow" };
}
