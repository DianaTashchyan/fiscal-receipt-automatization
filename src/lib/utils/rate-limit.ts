// ============================================================
// src/lib/utils/rate-limit.ts
// Simple in-memory sliding-window rate limiter.
// Suitable for single-instance deployments.
// For multi-instance, replace with a Redis-backed implementation.
// ============================================================

type Entry = { count: number; resetAt: number };

const store = new Map<string, Entry>();

// Prune expired entries every 5 minutes to prevent unbounded growth
setInterval(() => {
  const now = Date.now();
  for (const [key, entry] of store) {
    if (entry.resetAt < now) store.delete(key);
  }
}, 5 * 60 * 1000);

/**
 * Returns true if the request is within the rate limit, false if it exceeded.
 *
 * @param key   Unique key (e.g. `"login:1.2.3.4"`)
 * @param limit Max requests per window
 * @param windowMs  Window duration in milliseconds
 */
export function checkRateLimit(
  key: string,
  limit: number,
  windowMs: number
): boolean {
  const now = Date.now();
  const entry = store.get(key);

  if (!entry || entry.resetAt < now) {
    store.set(key, { count: 1, resetAt: now + windowMs });
    return true;
  }

  entry.count += 1;
  return entry.count <= limit;
}

/**
 * Extract a best-effort client IP from Next.js request headers.
 */
export function getClientIp(req: { headers: { get(name: string): string | null } }): string {
  return (
    req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ??
    req.headers.get("x-real-ip") ??
    "unknown"
  );
}
