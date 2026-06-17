// Tiny per-IP fixed-window rate limiter. In-memory only; per-instance on
// serverless. Matches nail-inspo's express-rate-limit semantics for the
// volumes we care about (single-digit reports/hour per real user).

export interface RateLimiterOptions {
  windowMs: number;
  max: number;
  now?: () => number;
}

export interface RateLimitDecision {
  allowed: boolean;
  remaining: number;
}

interface Entry {
  count: number;
  resetAt: number;
}

export function createRateLimiter(opts: RateLimiterOptions) {
  const now = opts.now ?? Date.now;
  const store = new Map<string, Entry>();

  function check(key: string): RateLimitDecision {
    const t = now();
    const existing = store.get(key);
    if (!existing || existing.resetAt <= t) {
      store.set(key, { count: 1, resetAt: t + opts.windowMs });
      return { allowed: true, remaining: opts.max - 1 };
    }
    if (existing.count >= opts.max) {
      return { allowed: false, remaining: 0 };
    }
    existing.count += 1;
    return { allowed: true, remaining: opts.max - existing.count };
  }

  function reset() {
    store.clear();
  }

  return { check, reset };
}
