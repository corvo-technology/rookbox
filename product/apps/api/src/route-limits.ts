import { createRateLimiter, type RateLimiter, type RateVerdict } from "./rate-limit.js";

/** The sensitive actions that carry their own request budget. */
export const LIMIT_CLASSES = [
  "machine_create",
  "machine_delete",
  "machine_fork",
  "machine_lifecycle",
  "machine_exec",
  "api_key_create",
  "desktop_link",
  "auth",
] as const;
export type LimitClass = (typeof LIMIT_CLASSES)[number];

/** `max` requests per `windowS` seconds. */
export type Budget = { max: number; windowS: number };
/** A class's budgets: per signed-in user and per client address. A missing scope is not limited. */
export type ClassBudget = { user?: Budget; ip?: Budget };
export type RouteLimits = Record<LimitClass, ClassBudget>;

/** Env variable that sets each class, for the docs and the error messages. */
export const LIMIT_ENV: Record<LimitClass, string> = {
  machine_create: "RATE_LIMIT_MACHINE_CREATE",
  machine_delete: "RATE_LIMIT_MACHINE_DELETE",
  machine_fork: "RATE_LIMIT_MACHINE_FORK",
  machine_lifecycle: "RATE_LIMIT_MACHINE_LIFECYCLE",
  machine_exec: "RATE_LIMIT_MACHINE_EXEC",
  api_key_create: "RATE_LIMIT_API_KEY_CREATE",
  desktop_link: "RATE_LIMIT_DESKTOP_LINK",
  auth: "RATE_LIMIT_AUTH",
};

/**
 * Defaults, as the same text an operator would set. Generous for one person working, tight
 * enough that a script or a stolen key cannot churn machines. The per-address figure is higher
 * than the per-user one because several people may share an address.
 */
export const DEFAULT_LIMITS: Record<LimitClass, string> = {
  machine_create: "user=20/3600,ip=60/3600",
  machine_delete: "user=40/600,ip=120/600",
  machine_fork: "user=20/3600,ip=60/3600",
  machine_lifecycle: "user=60/600,ip=180/600",
  machine_exec: "user=120/60,ip=300/60",
  api_key_create: "user=10/3600,ip=30/3600",
  desktop_link: "user=30/600,ip=90/600",
  // Every request to the sign-in endpoints, on top of the failed-sign-in counter. No user yet.
  auth: "ip=60/600",
};

/**
 * Parses `user=20/3600,ip=60/3600`. A scope can be `off`; the whole text `off` turns the class
 * off. Returns an error text instead of throwing, so the env schema can report it by name.
 */
export function parseBudget(text: string): ClassBudget | { error: string } {
  const value = text.trim().toLowerCase();
  if (value === "off") return {};
  const budget: ClassBudget = {};
  for (const part of value.split(",")) {
    const match = /^(user|ip)=(?:(\d{1,7})\/(\d{1,6})|off)$/.exec(part.trim());
    if (!match)
      return { error: `"${part.trim()}" is not user=<max>/<seconds>, ip=<max>/<seconds> or off` };
    const scope = match[1] as "user" | "ip";
    if (match[2] === undefined) continue;
    const max = Number(match[2]);
    const windowS = Number(match[3]);
    if (max < 1 || windowS < 1) return { error: "max and seconds must be at least 1" };
    budget[scope] = { max, windowS };
  }
  return budget;
}

export type Throttle = {
  /** Counts one request; says whether it may go on. */
  hit(cls: LimitClass, who: { userId?: string | null; ip: string }): RateVerdict;
};

/** Fixed-window counters per class and scope, held in memory (per API process). */
export function createThrottle(
  limits: RouteLimits,
  options: { now?: () => number; enabled?: boolean } = {},
): Throttle {
  const enabled = options.enabled ?? true;
  const limiters = new Map<string, RateLimiter>();
  const limiterFor = (cls: LimitClass, scope: "user" | "ip", budget: Budget) => {
    const key = `${cls}:${scope}`;
    let found = limiters.get(key);
    if (!found) {
      found = createRateLimiter({
        max: budget.max,
        windowMs: budget.windowS * 1_000,
        now: options.now,
      });
      limiters.set(key, found);
    }
    return found;
  };
  return {
    hit(cls, who) {
      if (!enabled) return { allowed: true };
      const budget = limits[cls];
      // Check both scopes before counting either, so a blocked call does not burn the other one.
      const checks: [RateLimiter, string][] = [];
      if (budget.ip) checks.push([limiterFor(cls, "ip", budget.ip), `ip:${who.ip}`]);
      if (budget.user && who.userId) {
        checks.push([limiterFor(cls, "user", budget.user), `user:${who.userId}`]);
      }
      for (const [limiter, key] of checks) {
        const verdict = limiter.check(key);
        if (!verdict.allowed) return verdict;
      }
      for (const [limiter, key] of checks) limiter.fail(key);
      return { allowed: true };
    },
  };
}
