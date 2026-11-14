import { JoinWaitlistInput } from "@rookbox/contracts";
import { type Context, Hono } from "hono";
import { cors } from "hono/cors";
import type { Logger } from "./logger.js";
import type { RateLimiter } from "./rate-limit.js";
import type { Waitlist } from "./waitlist.js";

/** A form post is tiny; anything bigger is not from the landing page. */
const MAX_BODY_BYTES = 4_096;

export type WaitlistRoutesDeps = {
  waitlist: Waitlist;
  /** The landing page's origin: the only browser origin allowed to post here. */
  wwwOrigin: string;
  /** Counts joins per client address. Each attempt counts, so a script cannot probe freely. */
  limiter?: RateLimiter;
  ipOf: (c: Context) => string;
  logger: Logger;
};

/**
 * `POST /waitlist`, public. Mounted before the app-wide CORS so it answers for the landing page's
 * origin only. Honeypot hits and repeat emails get the same `{ ok: true }` as a real join, so a
 * caller learns nothing about who is on the list.
 */
export function waitlistRoutes(deps: WaitlistRoutesDeps) {
  const { waitlist, limiter, logger } = deps;
  const app = new Hono();

  app.use(
    "*",
    cors({
      origin: (origin) => (origin === deps.wwwOrigin ? origin : ""),
      allowHeaders: ["content-type"],
      allowMethods: ["POST", "OPTIONS"],
      maxAge: 600,
    }),
  );

  app.post("/", async (c) => {
    const origin = c.req.header("origin");
    if (origin && origin !== deps.wwwOrigin) {
      return c.json({ code: "FORBIDDEN", message: "Not allowed." }, 403);
    }
    const address = deps.ipOf(c);
    if (limiter) {
      const verdict = limiter.check(address);
      if (!verdict.allowed) {
        c.header("retry-after", String(verdict.retryAfterS));
        logger.warn("waitlist rate limited");
        return c.json({ code: "RATE_LIMITED", retryAfterS: verdict.retryAfterS }, 429);
      }
      limiter.fail(address);
    }

    const raw = await c.req.text();
    if (raw.length > MAX_BODY_BYTES) return c.json({ code: "BAD_REQUEST" }, 413);
    let json: unknown;
    try {
      json = JSON.parse(raw);
    } catch {
      return c.json({ code: "BAD_REQUEST", message: "Send JSON." }, 400);
    }
    const parsed = JoinWaitlistInput.safeParse(json);
    if (!parsed.success) {
      return c.json({ code: "INVALID_EMAIL", message: "Enter a valid email address." }, 400);
    }
    const { website, ...input } = parsed.data;
    if (website) {
      logger.info("waitlist honeypot hit");
      return c.json({ ok: true });
    }
    try {
      await waitlist.join(input);
    } catch (error) {
      logger.error("waitlist join failed", { error });
      return c.json({ code: "INTERNAL_SERVER_ERROR", message: "Something went wrong." }, 500);
    }
    return c.json({ ok: true });
  });

  return app;
}
