import { createHmac } from "node:crypto";

export const SIGNATURE_HEADER = "X-Rookbox-Signature";
export const TIMESTAMP_HEADER = "X-Rookbox-Timestamp";
export const REPORTER_HEADER = "X-Rookbox-Reporter-Id";

/**
 * The signature of a request: HMAC-SHA256 over `<unix seconds>.<exact body>`, as `sha256=<hex>`.
 * The API (`apps/api/src/usage/signature.ts`) computes the same value to check it.
 */
export function signBody(secret: string, timestamp: string, body: string): string {
  return `sha256=${createHmac("sha256", secret).update(`${timestamp}.${body}`).digest("hex")}`;
}
