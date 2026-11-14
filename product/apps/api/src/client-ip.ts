import { isIP } from "node:net";

/**
 * The caller's address for rate limits and logs.
 *
 * `X-Forwarded-For` is whatever the client wrote plus what each proxy appended, so its first
 * entry is spoofable. With `trustedHops` proxies in front of this process, the entry that the
 * first of them added (the real client, as that proxy saw it) is the `trustedHops`-th from the
 * right; everything left of it is untrusted and ignored. With 0 hops the header is ignored and the
 * socket's peer address is used.
 */
export function clientAddress(input: {
  forwardedFor: string | null | undefined;
  peer: string | undefined;
  trustedHops: number;
}): string {
  const peer = input.peer && isIP(input.peer) ? input.peer : "unknown";
  if (input.trustedHops <= 0 || !input.forwardedFor) return peer;
  const parts = input.forwardedFor
    .split(",")
    .map((part) => part.trim())
    .filter(Boolean);
  const candidate = parts[parts.length - input.trustedHops];
  return candidate && isIP(candidate) ? candidate : peer;
}
