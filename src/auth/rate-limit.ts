type Bucket = { hits: number; resetAt: number };

const buckets = new Map<string, Bucket>();

export function rateLimit(key: string, limit = 20, windowMs = 15 * 60 * 1000): { ok: true } | { ok: false; retryAfter: number } {
  const now = Date.now();
  const current = buckets.get(key);
  if (!current || current.resetAt <= now) {
    buckets.set(key, { hits: 1, resetAt: now + windowMs });
    return { ok: true };
  }
  if (current.hits >= limit) return { ok: false, retryAfter: Math.ceil((current.resetAt - now) / 1000) };
  current.hits += 1;
  return { ok: true };
}

export function resetRateLimits(): void {
  buckets.clear();
}

export function clientKey(request: Request, action: string): string {
  const forwarded = request.headers.get("x-forwarded-for")?.split(",")[0]?.trim();
  return `${action}:${forwarded || "local"}`;
}
