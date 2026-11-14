import { describe, expect, it } from "vitest";
import { clientAddress } from "./client-ip.js";

describe("clientAddress", () => {
  it("ignores X-Forwarded-For with no trusted proxy, so it cannot be spoofed", () => {
    expect(clientAddress({ forwardedFor: "9.9.9.9", peer: "10.0.0.5", trustedHops: 0 })).toBe(
      "10.0.0.5",
    );
  });

  it("takes the entry the first trusted proxy added, not what the client wrote", () => {
    // The client claimed 6.6.6.6; the one proxy appended the address it really saw.
    expect(
      clientAddress({ forwardedFor: "6.6.6.6, 203.0.113.7", peer: "10.0.0.5", trustedHops: 1 }),
    ).toBe("203.0.113.7");
    // Two proxies: the edge saw the client, the inner one saw the edge.
    expect(
      clientAddress({
        forwardedFor: "6.6.6.6, 203.0.113.7, 172.16.0.2",
        peer: "10.0.0.5",
        trustedHops: 2,
      }),
    ).toBe("203.0.113.7");
  });

  it("falls back to the peer when the header is short, missing or not an address", () => {
    expect(clientAddress({ forwardedFor: "1.1.1.1", peer: "10.0.0.5", trustedHops: 2 })).toBe(
      "10.0.0.5",
    );
    expect(clientAddress({ forwardedFor: null, peer: "10.0.0.5", trustedHops: 1 })).toBe(
      "10.0.0.5",
    );
    expect(clientAddress({ forwardedFor: "not-an-ip", peer: "10.0.0.5", trustedHops: 1 })).toBe(
      "10.0.0.5",
    );
    expect(clientAddress({ forwardedFor: undefined, peer: undefined, trustedHops: 0 })).toBe(
      "unknown",
    );
  });

  it("reads IPv6", () => {
    expect(clientAddress({ forwardedFor: "2001:db8::1", peer: "::1", trustedHops: 1 })).toBe(
      "2001:db8::1",
    );
  });
});
