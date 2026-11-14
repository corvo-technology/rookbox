import { createHmac, timingSafeEqual } from "node:crypto";

export const SIGNATURE_HEADER = "x-rookbox-signature";
export const TIMESTAMP_HEADER = "x-rookbox-timestamp";
export const REPORTER_HEADER = "x-rookbox-reporter-id";

/** A request older (or newer) than this many seconds is refused, so a captured one cannot be replayed. */
export const MAX_CLOCK_SKEW_S = 300;

/**
 * The signature of a request: HMAC-SHA256 over `<timestamp>.<exact body>`, as `sha256=<hex>`.
 * The reporter (`apps/reporter/src/sign.ts`) computes the same value.
 */
export function signBody(secret: string, timestamp: string, body: string): string {
  return `sha256=${createHmac("sha256", secret).update(`${timestamp}.${body}`).digest("hex")}`;
}

export type SignatureVerdict = "ok" | "missing" | "stale" | "invalid";

/** Checks the timestamp window first, then the signature in constant time. */
export function verifySignature(input: {
  secret: string;
  timestamp: string | null;
  signature: string | null;
  body: string;
  nowMs: number;
}): SignatureVerdict {
  const { secret, timestamp, signature, body, nowMs } = input;
  if (!timestamp || !signature) return "missing";
  if (!/^\d{1,12}$/.test(timestamp)) return "invalid";
  if (Math.abs(nowMs / 1000 - Number(timestamp)) > MAX_CLOCK_SKEW_S) return "stale";
  const expected = Buffer.from(signBody(secret, timestamp, body));
  const given = Buffer.from(signature);
  // timingSafeEqual needs equal lengths; the length of a SHA-256 hex digest is not a secret.
  if (expected.length !== given.length || !timingSafeEqual(expected, given)) return "invalid";
  return "ok";
}
