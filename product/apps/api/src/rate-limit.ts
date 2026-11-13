export type RateLimiterOptions = {
  /** Failures allowed per key within the window. */
  max: number;
  windowMs: number;
  now?: () => number;
  /** Most keys kept at once; the oldest are dropped past it, so memory stays bounded. */
  maxKeys?: number;
};

export type RateVerdict = { allowed: true } | { allowed: false; retryAfterS: number };

/**
 * A fixed-window failure counter held in memory. It is per process, which is enough for one API
 * instance; a second instance would count on its own.
 */
export function createRateLimiter(options: RateLimiterOptions) {
  const now = options.now ?? Date.now;
  const maxKeys = options.maxKeys ?? 10_000;
  const entries = new Map<string, { count: number; resetAt: number }>();

  function live(key: string): { count: number; resetAt: number } | null {
    const entry = entries.get(key);
    if (!entry) return null;
    if (entry.resetAt <= now()) {
      entries.delete(key);
      return null;
    }
    return entry;
  }

  return {
    /** Whether `key` may try again. Does not count. */
    check(key: string): RateVerdict {
      const entry = live(key);
      if (!entry || entry.count < options.max) return { allowed: true };
      return {
        allowed: false,
        retryAfterS: Math.max(1, Math.ceil((entry.resetAt - now()) / 1000)),
      };
    },
    /** Counts one failure. */
    fail(key: string): void {
      const entry = live(key);
      if (entry) {
        entry.count += 1;
        return;
      }
      if (entries.size >= maxKeys) {
        for (const [other, value] of entries) {
          if (value.resetAt <= now()) entries.delete(other);
        }
        const oldest = entries.keys().next().value;
        if (entries.size >= maxKeys && oldest !== undefined) entries.delete(oldest);
      }
      entries.set(key, { count: 1, resetAt: now() + options.windowMs });
    },
    /** Forgets `key`, after a success. */
    reset(key: string): void {
      entries.delete(key);
    },
  };
}

export type RateLimiter = ReturnType<typeof createRateLimiter>;
