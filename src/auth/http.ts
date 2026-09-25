import { RATE_LIMITED } from "@/auth/gate";

export function siteOrigin(request: Request): string {
  const configured = process.env.SITE_URL?.trim().replace(/\/$/, "");
  if (configured) return configured;
  return new URL(request.url).origin;
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
