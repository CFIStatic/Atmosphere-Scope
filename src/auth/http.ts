import { RATE_LIMITED, safeNext } from "@/auth/gate";

export type PublicOriginInput = {
  siteUrl?: string | null;
  forwardedProto?: string | null;
  forwardedHost?: string | null;
  requestUrl?: string | null;
};

/** Prefer SITE_URL, then the proxy host, then the request origin. */
export function publicOrigin(input: PublicOriginInput): string {
  const configured = originFromUrl(input.siteUrl);
  if (configured) return configured;
  const forwarded = forwardedOrigin(input.forwardedProto, input.forwardedHost);
  if (forwarded) return forwarded;
  return originFromUrl(input.requestUrl) ?? "http://localhost:3000";
}

export function siteOrigin(request: Request, env: NodeJS.ProcessEnv | { SITE_URL?: string } = process.env): string {
  return publicOrigin({
    siteUrl: env.SITE_URL,
    forwardedProto: request.headers.get("x-forwarded-proto"),
    forwardedHost: request.headers.get("x-forwarded-host"),
    requestUrl: request.url,
  });
}

export function absoluteUrl(origin: string, path: string): string {
  return new URL(path, origin).toString();
}

/** A signup follows next. An invite or recovery sets a password. A bad signup link returns to login. */
export function authCallbackDestination(input: { ok: boolean; type: string | null; next: string | null }): string {
  if (!input.ok) {
    if (input.type === "signup") return "/login?error=confirm";
    return "/auth/reset?error=invalid";
  }
  if (input.type === "invite" || input.type === "recovery") return "/auth/reset";
  return safeNext(input.next);
}

function originFromUrl(value: string | null | undefined): string | null {
  const text = value?.trim() ?? "";
  if (!text) return null;
  try {
    return new URL(text).origin;
  } catch {
    return null;
  }
}

function forwardedOrigin(proto: string | null | undefined, host: string | null | undefined): string | null {
  const rawHost = host?.split(",")[0]?.trim() ?? "";
  const rawProto = proto?.split(",")[0]?.trim() || "https";
  if (!rawHost || /[\s/\\]/.test(rawHost)) return null;
  if (rawProto !== "http" && rawProto !== "https") return null;
  return `${rawProto}://${rawHost}`;
}

export function callbackUrl(origin: string, next: string): string {
  return `${origin}/auth/callback?next=${encodeURIComponent(next)}`;
}

export function rateLimited(status: number, message: string): boolean {
  return status === 429 || /rate limit/i.test(message);
}

export function rateLimitMessage(status: number, message: string): string | null {
  return rateLimited(status, message) ? RATE_LIMITED : null;
}
